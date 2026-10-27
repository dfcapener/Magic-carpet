import { CONFIG } from './config.js';

const MAP_SCALE = 4; // heightmap cells per minimap pixel

export class Hud {
  constructor(canvas, terrain) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = terrain;
    const n = terrain.size / MAP_SCALE;
    this.map = document.createElement('canvas');
    this.map.width = this.map.height = n;
    this.mapCtx = this.map.getContext('2d');
    this.mapImage = this.mapCtx.createImageData(n, n);
    this.mapVersion = -1;
    this.mapAge = 0;
  }

  refreshMap(dt) {
    this.mapAge += dt;
    if (this.mapVersion === this.terrain.version || this.mapAge < 0.5) return;
    this.mapAge = 0;
    this.mapVersion = this.terrain.version;
    const t = this.terrain, n = this.map.width;
    const out = new Uint32Array(this.mapImage.data.buffer);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) out[y * n + x] = t.color[t.idx(x * MAP_SCALE, y * MAP_SCALE)];
    }
    this.mapCtx.putImageData(this.mapImage, 0, 0);
  }

  draw(world, dt) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const u = Math.max(1, Math.min(W, H) / 600); // UI scale
    const p = world.player;
    this.refreshMap(dt);

    this.drawCarpet(ctx, W, H, u, world);

    if (p.hurtFlash > 0) {
      ctx.fillStyle = `rgba(200,0,0,${p.hurtFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Crosshair.
    ctx.strokeStyle = 'rgba(255,240,200,0.8)';
    ctx.lineWidth = 2 * u;
    const cx = W / 2, cy = H / 2, r = 7 * u;
    ctx.beginPath();
    ctx.moveTo(cx - r * 2, cy); ctx.lineTo(cx - r, cy);
    ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r * 2, cy);
    ctx.moveTo(cx, cy - r * 2); ctx.lineTo(cx, cy - r);
    ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy + r * 2);
    ctx.stroke();

    // Bars.
    const bw = 220 * u, bh = 14 * u, x0 = 20 * u;
    let y0 = H - 30 * u - bh * 3;
    this.bar(ctx, x0, y0, bw, bh, p.health / CONFIG.player.maxHealth, '#c8302a', `Health ${Math.ceil(p.health)}`, u);
    y0 += bh + 8 * u;
    const castleNeed = world.castle ? CONFIG.castleLevels[Math.min(world.castle.level + 1, 4)] : CONFIG.spells.castle.cost;
    this.bar(ctx, x0, y0, bw, bh, Math.min(1, world.mana / castleNeed), '#d9a520', `Mana ${Math.floor(world.mana)}`, u);
    y0 += bh + 8 * u;
    const share = world.worldManaShare();
    this.bar(ctx, x0, y0, bw, bh, share / 100, '#3a7bd5', `World mana ${share.toFixed(0)}% / goal ${CONFIG.goalPercent}%`, u);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0 + bw * (CONFIG.goalPercent / 100) - u, y0 - 2 * u, 2 * u, bh + 4 * u);

    // Spell hints.
    ctx.font = `${12 * u}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,245,220,0.85)';
    const S = CONFIG.spells;
    const lines = [
      `LMB / F  Fireball (${S.fireball.cost})`,
      `RMB / R  Possession (${S.possession.cost})`,
      `C  Castle (${S.castle.cost})${world.castle ? ` — level ${world.castle.level + 1}` : ''}`,
      `H  Heal (${S.heal.cost})`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, W - 20 * u, H - 30 * u - (lines.length - 1 - i) * 16 * u));

    this.drawMinimap(ctx, W, u, world);

    // Messages.
    ctx.textAlign = 'center';
    ctx.font = `bold ${18 * u}px Georgia, serif`;
    world.messages.forEach((m, i) => {
      const a = Math.min(1, m.t / 0.6, (m.duration - m.t) / 0.2 + 0.2);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`;
      ctx.fillText(m.text, W / 2 + 2 * u, 60 * u + i * 26 * u + 2 * u);
      ctx.fillStyle = `rgba(255,230,160,${a})`;
      ctx.fillText(m.text, W / 2, 60 * u + i * 26 * u);
    });
    ctx.textAlign = 'left';
  }

  bar(ctx, x, y, w, h, frac, color, label, u) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.fillStyle = '#fff';
    ctx.font = `${10 * u}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4 * u, y + h - 3 * u);
  }

  drawMinimap(ctx, W, u, world) {
    const size = 150 * u, x0 = W - size - 20 * u, y0 = 20 * u;
    const t = this.terrain, p = world.player;
    const k = size / t.size;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0 - 3 * u, y0 - 3 * u, size + 6 * u, size + 6 * u);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.map, x0, y0, size, size);

    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0 + x * k - r * u, y0 + y * k - r * u, r * 2 * u, r * 2 * u);
    };
    for (const b of world.manaBalls) dot(b.x, b.y, b.owner ? '#ffd040' : '#ffffff', 1.2);
    for (const v of world.vultures) dot(v.x, v.y, '#ff3020', 1.5);
    for (const bl of world.balloons) dot(bl.x, bl.y, '#ff8080', 1.5);
    if (world.castle) dot(world.castle.x, world.castle.y, '#e63c28', 3);

    // Player arrow.
    const px = x0 + p.x * k, py = y0 + p.y * k;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = u;
    ctx.beginPath();
    ctx.moveTo(7 * u, 0);
    ctx.lineTo(-4 * u, -4 * u);
    ctx.lineTo(-2 * u, 0);
    ctx.lineTo(-4 * u, 4 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // The leading edge of the carpet, bobbing gently at the bottom of the view.
  drawCarpet(ctx, W, H, u, world) {
    const bob = Math.sin(world.time * 2.2) * 3 * u + world.player.roll * 20 * u;
    const top = H - 40 * u + bob, w = W * 0.5;
    const l = W / 2 - w / 2, r = W / 2 + w / 2;
    ctx.fillStyle = '#7a1c1c';
    ctx.beginPath();
    ctx.moveTo(l + 40 * u, top);
    ctx.lineTo(r - 40 * u, top);
    ctx.lineTo(r, H + 10 * u);
    ctx.lineTo(l, H + 10 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d9a520';
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(l + 46 * u, top + 6 * u);
    ctx.lineTo(r - 46 * u, top + 6 * u);
    ctx.stroke();
    // Tassels.
    ctx.fillStyle = '#e8c060';
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const x = l + 40 * u + ((w - 80 * u) * i) / n;
      ctx.fillRect(x - 1.5 * u, top - 7 * u + Math.sin(world.time * 6 + i) * 1.5 * u, 3 * u, 7 * u);
    }
  }
}
