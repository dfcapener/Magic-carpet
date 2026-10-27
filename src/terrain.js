import { CONFIG } from './config.js';

// Small deterministic PRNG so every run of a given seed builds the same world.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAT_NATURAL = 0;
export const MAT_STONE = 1;
export const MAT_SCORCH = 2;
export const MAT_COURTYARD = 3;
export const MAT_BANNER = 4;

export function packRGB(r, g, b) {
  return (255 << 24) | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

const smooth = (t) => t * t * (3 - 2 * t);

export class Terrain {
  constructor(seed = CONFIG.seed) {
    this.bits = CONFIG.mapBits;
    this.size = 1 << this.bits;
    this.mask = this.size - 1;
    this.water = CONFIG.waterLevel;
    const n = this.size * this.size;
    this.height = new Float32Array(n); // true ground height
    this.render = new Float32Array(n); // max(ground, water) — what the renderer draws
    this.color = new Uint32Array(n); // lit colour, ABGR packed
    this.material = new Uint8Array(n);
    this.detail = new Uint8Array(n); // per-texel noise used as "texture"
    this.version = 0; // bumped on every deformation (minimap cache key)
    this.bannerColor = [230, 60, 40];
    this.rng = mulberry32(seed);
    this.generate();
  }

  idx(x, y) {
    return ((Math.floor(y) & this.mask) << this.bits) | (Math.floor(x) & this.mask);
  }

  wrap(v) {
    const s = this.size;
    return ((v % s) + s) % s;
  }

  // Shortest signed distance along one wrapped axis.
  delta(d) {
    return d - this.size * Math.round(d / this.size);
  }

  // Bilinear ground height (ignores water).
  heightAt(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const h = this.height;
    const a = h[this.idx(x0, y0)], b = h[this.idx(x0 + 1, y0)];
    const c = h[this.idx(x0, y0 + 1)], d = h[this.idx(x0 + 1, y0 + 1)];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // Solid surface: ground or water, whichever is higher.
  surfaceAt(x, y) {
    return Math.max(this.heightAt(x, y), this.water);
  }

  generate() {
    const { size, mask, rng } = this;
    const n = size * size;

    // Tileable value noise: each octave uses a lattice whose period divides the
    // map size, so the result wraps seamlessly on both axes.
    const raw = new Float32Array(n);
    const octave = (period, amp, ridged) => {
      const cells = size / period;
      const grid = new Float32Array(cells * cells);
      for (let i = 0; i < grid.length; i++) grid[i] = rng();
      const cm = cells - 1;
      for (let y = 0; y < size; y++) {
        const gy = y / period, iy = Math.floor(gy), ty = smooth(gy - iy);
        const r0 = (iy & cm) * cells, r1 = ((iy + 1) & cm) * cells;
        for (let x = 0; x < size; x++) {
          const gx = x / period, ix = Math.floor(gx), tx = smooth(gx - ix);
          const c0 = ix & cm, c1 = (ix + 1) & cm;
          const top = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * tx;
          const bot = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * tx;
          let v = top + (bot - top) * ty;
          if (ridged) v = 1 - Math.abs(v * 2 - 1);
          raw[(y << this.bits) | x] += v * amp;
        }
      }
    };
    octave(128, 1.0, false);
    octave(64, 0.55, false);
    octave(32, 0.35, true);
    octave(16, 0.18, false);
    octave(8, 0.09, false);
    octave(4, 0.04, false);

    // Map so ~32% of the world sits under water, then curve the land so there
    // are broad lowlands and a few sharp peaks.
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      if (raw[i] < min) min = raw[i];
      if (raw[i] > max) max = raw[i];
    }
    const sorted = Float32Array.from(raw).sort();
    const sea = sorted[Math.floor(n * 0.32)];
    const { water } = this;
    const top = CONFIG.maxHeight;
    for (let i = 0; i < n; i++) {
      const v = raw[i];
      let h;
      if (v >= sea) {
        const t = (v - sea) / (max - sea);
        h = water + 0.5 + Math.pow(t, 1.5) * (top - water);
      } else {
        const t = (v - min) / (sea - min);
        h = 2 + t * (water - 2.5);
      }
      this.height[i] = h;
      this.detail[i] = (rng() * 256) | 0;
    }
    this.recolor(0, 0, mask, mask);
  }

  // Recompute render heights and lit colours for an inclusive cell rectangle
  // (coordinates may lie outside the map; they wrap).
  recolor(x0, y0, x1, y1) {
    const { height, render, color, material, detail, water, mask, bits } = this;
    // Light from the north-west, slightly above.
    const lx = -0.55, ly = -0.45, lz = 0.7;
    const [br, bg, bb] = this.bannerColor;
    for (let yy = y0; yy <= y1; yy++) {
      const y = yy & mask;
      const ym = ((y - 1) & mask) << bits, yp = ((y + 1) & mask) << bits, yr = y << bits;
      for (let xx = x0; xx <= x1; xx++) {
        const x = xx & mask;
        const i = yr | x;
        const h = height[i];
        const mat = material[i];
        const d = detail[i];
        render[i] = h < water ? water : h;
        let r, g, b;

        if (h < water && (mat === MAT_NATURAL || mat === MAT_SCORCH)) {
          const depth = Math.min(1, (water - h) / 18);
          r = 40 - 30 * depth;
          g = 120 - 60 * depth;
          b = 170 - 40 * depth;
          const wv = (d & 15) - 8;
          color[i] = packRGB(r + wv * 0.5, g + wv, b + wv);
          continue;
        }

        const dx = height[yr | ((x - 1) & mask)] - height[yr | ((x + 1) & mask)];
        const dy = height[ym | x] - height[yp | x];
        const len = Math.hypot(dx, dy, 2);
        let shade = (dx * lx + dy * ly + 2 * lz) / len;
        shade = 0.35 + Math.max(0, shade) * 0.85;
        const slope = Math.hypot(dx, dy);
        const tex = 0.88 + (d / 255) * 0.24;

        if (mat === MAT_STONE) {
          r = 150; g = 145; b = 135;
        } else if (mat === MAT_COURTYARD) {
          r = 180; g = 170; b = 150;
        } else if (mat === MAT_BANNER) {
          r = br; g = bg; b = bb;
          shade = Math.max(shade, 0.9);
        } else if (h < water + 2.5) {
          r = 214; g = 196; b = 140; // beach
        } else if (h > 96) {
          r = 240; g = 242; b = 248; // snow
        } else if (slope > 5.5 || h > 78) {
          r = 128; g = 112; b = 96; // rock
        } else {
          const lush = Math.min(1, (h - water) / 45);
          r = 70 + 40 * lush;
          g = 140 - 25 * lush;
          b = 50 + 10 * lush;
          if (d > 236) { r += 40; g += 30; } // flowers / scrub
        }

        if (mat === MAT_SCORCH) {
          r = r * 0.35 + 30; g = g * 0.3 + 20; b = b * 0.3 + 15;
        }
        color[i] = packRGB(r * shade * tex, g * shade * tex, b * shade * tex);
      }
    }
    this.version++;
  }

  // Apply fn(oldHeight, dist01, x, y) -> newHeight over a disc, then relight.
  deform(cx, cy, radius, fn, material = null) {
    const r = Math.ceil(radius);
    const x0 = Math.floor(cx) - r, y0 = Math.floor(cy) - r;
    for (let y = y0; y <= y0 + 2 * r; y++) {
      for (let x = x0; x <= x0 + 2 * r; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
        if (d > 1) continue;
        const i = this.idx(x, y);
        this.height[i] = Math.max(0.5, fn(this.height[i], d, x, y));
        if (material !== null) this.material[i] = material;
      }
    }
    this.recolor(x0 - 1, y0 - 1, x0 + 2 * r + 1, y0 + 2 * r + 1);
  }

  crater(cx, cy, radius, depth) {
    this.deform(
      cx, cy, radius,
      (h, d) => {
        const bowl = Math.cos(d * Math.PI * 0.5);
        return h - depth * bowl * bowl;
      },
      null,
    );
    // Scorch the middle without clobbering castle stone.
    const r = Math.ceil(radius * 0.8);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const i = this.idx(cx + x, cy + y);
        if (this.material[i] === MAT_NATURAL && this.height[i] >= this.water) {
          this.material[i] = MAT_SCORCH;
        }
      }
    }
    this.recolor(Math.floor(cx) - r - 1, Math.floor(cy) - r - 1, Math.floor(cx) + r + 1, Math.floor(cy) + r + 1);
  }

  // Raw cell write without relighting; callers batch a recolor() afterwards.
  setCell(x, y, h, mat) {
    const i = this.idx(x, y);
    this.height[i] = h;
    this.material[i] = mat;
  }
}
