import { CONFIG } from './config.js';

// Voxel-space heightmap renderer (front-to-back column casting with a y-buffer)
// into a low-res framebuffer, plus depth-tested billboard sprites. The final
// image is blitted to the display canvas with the carpet's bank (roll) applied.
export class Renderer {
  constructor(canvas, terrain) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
    this.W = CONFIG.screenW;
    this.H = CONFIG.screenH;
    this.off = document.createElement('canvas');
    this.off.width = this.W;
    this.off.height = this.H;
    this.offCtx = this.off.getContext('2d');
    this.image = this.offCtx.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.image.data.buffer);
    this.depth = new Float32Array(this.W * this.H);
    this.ybuf = new Int32Array(this.W);
    this.tanHalf = Math.tan(CONFIG.fov / 2);
    this.F = this.W / 2 / this.tanHalf; // focal length in pixels
    this.maxDist = CONFIG.drawDistance;
    this.skyRows = new Uint32Array(this.H);
    const [fr, fg, fb] = CONFIG.sky.horizon;
    this.fogRGB = [fr, fg, fb];
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, sin: 0, cos: 1, horizon: 0 };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // Project a world point. Returns null when behind the camera / too far.
  project(x, y, z) {
    const c = this.cam;
    const t = this.terrain;
    const dx = t.delta(x - c.x), dy = t.delta(y - c.y);
    const depth = dx * c.cos + dy * c.sin;
    if (depth < 0.5 || depth > this.maxDist) return null;
    const side = -dx * c.sin + dy * c.cos;
    return {
      sx: this.W / 2 + (side / depth) * this.F,
      sy: c.horizon + ((c.z - z) / depth) * this.F,
      depth,
    };
  }

  render(camera, sprites, time) {
    const { W, H, buf, depth, ybuf, F, terrain, maxDist } = this;
    const c = this.cam;
    Object.assign(c, camera);
    c.sin = Math.sin(c.yaw);
    c.cos = Math.cos(c.yaw);
    c.horizon = H / 2 + c.pitch;

    this.buildSky(c.horizon);
    ybuf.fill(H);

    const { render: hmap, color, height } = terrain;
    const mask = terrain.mask, bits = terrain.bits, water = terrain.water;
    const detail = terrain.detail;
    const n = terrain.size * terrain.size;
    const offset = terrain.size * 8; // keeps sample coords positive for |0
    const [fr, fg, fb] = this.fogRGB;
    const sinY = c.sin, cosY = c.cos;
    const rx = -sinY, ry = cosY; // right vector
    const horizon = c.horizon, camZ = c.z;
    const shimmer = ((time * 23) | 0) * 513; // shifts the sparkle pattern
    const fogStart = maxDist * 0.35;

    let z = 1;
    let dz = 0.2;
    while (z < maxDist) {
      const half = z * this.tanHalf;
      let px = c.x + cosY * z - rx * half + offset;
      let py = c.y + sinY * z - ry * half + offset;
      const sx = (rx * 2 * half) / W;
      const sy = (ry * 2 * half) / W;
      const invz = F / z;
      const fogT = z < fogStart ? 0 : Math.min(1, (z - fogStart) / (maxDist - fogStart));
      const f = (fogT * fogT * 256) | 0;
      const nf = 256 - f;
      const fogR = fr * f, fogG = fg * f, fogB = fb * f;

      for (let i = 0; i < W; i++) {
        const idx = (((py | 0) & mask) << bits) | ((px | 0) & mask);
        px += sx;
        py += sy;
        const yb = ybuf[i];
        if (yb <= 0) continue;
        let top = ((camZ - hmap[idx]) * invz + horizon) | 0;
        if (top < 0) top = 0;
        if (top >= yb) continue;

        let col = color[idx];
        if (height[idx] < water && detail[(idx + shimmer) % n] > 244) {
          col = 0xfff0e0c8; // sparkle on the water
        }
        const r = (((col & 255) * nf + fogR) >> 8);
        const g = ((((col >> 8) & 255) * nf + fogG) >> 8);
        const b = ((((col >> 16) & 255) * nf + fogB) >> 8);
        col = 0xff000000 | (b << 16) | (g << 8) | r;

        for (let y = top, o = top * W + i; y < yb; y++, o += W) {
          buf[o] = col;
          depth[o] = z;
        }
        ybuf[i] = top;
      }
      z += dz;
      dz += 0.006;
    }

    // Sky fills whatever the terrain didn't cover.
    const sky = this.skyRows;
    for (let i = 0; i < W; i++) {
      const yb = ybuf[i];
      for (let y = 0, o = i; y < yb; y++, o += W) {
        buf[o] = sky[y];
        depth[o] = Infinity;
      }
    }

    for (const s of sprites) this.drawSprite(s);

    this.offCtx.putImageData(this.image, 0, 0);
    this.blit(c.roll);
  }

  buildSky(horizon) {
    const [tr, tg, tb] = CONFIG.sky.top;
    const [hr, hg, hb] = CONFIG.sky.horizon;
    for (let y = 0; y < this.H; y++) {
      const t = Math.max(0, Math.min(1, (horizon - y) / (this.H * 0.9)));
      const k = Math.sqrt(t);
      this.skyRows[y] = 0xff000000 |
        ((hb + (tb - hb) * k) << 16) | ((hg + (tg - hg) * k) << 8) | (hr + (tr - hr) * k);
    }
  }

  // Sprite: { x, y, z, img: {w,h,data}, size (world units tall) }
  drawSprite(s) {
    const p = this.project(s.x, s.y, s.z);
    if (!p) return;
    const { W, H, buf, depth, F, maxDist } = this;
    const img = s.img;
    const ph = (s.size / p.depth) * F;
    if (ph < 0.75) return;
    const pw = ph * (img.w / img.h);
    const x0 = p.sx - pw / 2, y0 = p.sy - ph / 2;
    const ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(W - 1, Math.ceil(x0 + pw));
    const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(H - 1, Math.ceil(y0 + ph));
    if (ix0 > ix1 || iy0 > iy1) return;

    const fogStart = maxDist * 0.35;
    const fogT = p.depth < fogStart ? 0 : Math.min(1, (p.depth - fogStart) / (maxDist - fogStart));
    const f = (fogT * fogT * 256) | 0, nf = 256 - f;
    const [fr, fg, fb] = this.fogRGB;
    const fogR = fr * f, fogG = fg * f, fogB = fb * f;
    const data = img.data;
    const kx = img.w / pw, ky = img.h / ph;
    const d = p.depth;

    for (let y = iy0; y <= iy1; y++) {
      const v = Math.floor((y + 0.5 - y0) * ky);
      if (v < 0 || v >= img.h) continue;
      const row = v * img.w;
      for (let x = ix0; x <= ix1; x++) {
        const u = Math.floor((x + 0.5 - x0) * kx);
        if (u < 0 || u >= img.w) continue;
        const col = data[row + u];
        if (!col) continue;
        const o = y * W + x;
        if (d >= depth[o]) continue;
        depth[o] = d;
        const r = (((col & 255) * nf + fogR) >> 8);
        const g = ((((col >> 8) & 255) * nf + fogG) >> 8);
        const b = ((((col >> 16) & 255) * nf + fogB) >> 8);
        buf[o] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
  }

  blit(roll) {
    const { ctx, canvas, W, H } = this;
    const cw = canvas.width, ch = canvas.height;
    // Cover-fit, enlarged while banking so the rotated corners stay filled.
    const cover = Math.max(cw / W, ch / H);
    const extra = 1 + Math.abs(Math.sin(roll)) * 0.6;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(roll);
    ctx.scale(cover * extra, cover * extra);
    ctx.drawImage(this.off, -W / 2, -H / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
