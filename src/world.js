import { CONFIG } from './config.js';
import { mulberry32 } from './terrain.js';
import { Player } from './player.js';
import { ManaBall, Projectile, Castle, Balloon, Vulture } from './entities.js';

const PARTICLES = {
  spark: { img: 'spark', size: 1.2, life: 0.35, rise: 2 },
  possessionSpark: { img: 'possession', size: 0.9, life: 0.4, rise: 4 },
  smoke: { img: 'smoke', size: 2.2, life: 1.2, rise: 6 },
};

export class World {
  constructor({ terrain, sprites, audio, input, renderer, touch = false }) {
    Object.assign(this, { terrain, sprites, audio, input, renderer });
    this.rng = mulberry32(CONFIG.seed + 1);
    this.time = 0;
    this.mana = CONFIG.startMana;
    this.castle = null;
    this.balloons = [];
    this.manaBalls = [];
    this.projectiles = [];
    this.vultures = [];
    this.effects = [];
    this.particles = [];
    this.messages = [];
    this.won = false;
    this.vultureTimer = 0;

    const start = this.findLand(() => true);
    this.player = new Player(start[0], start[1], terrain);
    for (let i = 0; i < CONFIG.manaBalls; i++) {
      const [x, y] = this.findLand(() => true);
      this.manaBalls.push(new ManaBall(x, y, 10 + Math.floor(this.rng() * 21)));
    }
    for (let i = 0; i < CONFIG.vultures; i++) this.spawnVulture();

    this.message(touch ? 'Tap Castle to raise your castle' : 'Press C to raise your castle', 6);
    this.message(touch ? 'Aim at mana and tap Claim' : 'Right-click mana to possess it', 6);
  }

  // Random land cell (above the beach) satisfying pred.
  findLand(pred) {
    const t = this.terrain;
    for (let tries = 0; tries < 5000; tries++) {
      const x = this.rng() * t.size, y = this.rng() * t.size;
      const h = t.heightAt(x, y);
      if (h > t.water + 3 && h < 80 && pred(x, y)) return [x, y];
    }
    return [t.size / 2, t.size / 2];
  }

  distToPlayer(x, y) {
    const t = this.terrain, p = this.player;
    return Math.hypot(t.delta(x - p.x), t.delta(y - p.y));
  }

  spawnVulture() {
    const [x, y] = this.findLand((x, y) => !this.player || this.distToPlayer(x, y) > 150);
    this.vultures.push(new Vulture(x, y, this.terrain.surfaceAt(x, y) + 30));
  }

  message(text, duration = 3) {
    this.messages.push({ text, t: duration, duration });
    if (this.messages.length > 4) this.messages.shift();
  }

  spendMana(cost) {
    if (this.mana < cost) {
      this.audio.fail();
      return false;
    }
    this.mana -= cost;
    return true;
  }

  depositMana(amount) {
    this.mana += amount;
    if (!this.castle) return;
    // The castle grows with stored mana but never shrinks from spending.
    let level = 0;
    CONFIG.castleLevels.forEach((need, i) => { if (this.mana >= need) level = i; });
    if (level > this.castle.level) {
      this.castle.setLevel(level);
      this.audio.castle();
      this.message(`Castle grows to level ${this.castle.level + 1}!`, 4);
      while (this.balloons.length < this.castle.level + 1) this.balloons.push(new Balloon(this.castle));
    }
  }

  dropMana(x, y, value) {
    this.manaBalls.push(new ManaBall(x, y, value));
  }

  // Nearest possessed, unclaimed ball for a balloon starting at (x, y).
  findPossessedBall(x, y) {
    let best = null, bestD = Infinity;
    for (const b of this.manaBalls) {
      if (b.owner !== 1 || b.claimedBy || b.dead) continue;
      const d = Math.hypot(this.terrain.delta(b.x - x), this.terrain.delta(b.y - y));
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  launch(kind, p) {
    const [dx, dy, dz] = p.aim(this.renderer);
    const speed = CONFIG.spells[kind].speed;
    // Spawn a little ahead and below the eye so the bolt is visible leaving.
    const proj = new Projectile(
      kind,
      this.terrain.wrap(p.x + dx * 2), this.terrain.wrap(p.y + dy * 2), p.z - 1.5 + dz * 2,
      dx * speed + p.vx, dy * speed + p.vy, dz * speed,
    );
    this.projectiles.push(proj);
    if (kind === 'fireball') this.audio.fireball();
    else this.audio.possess();
  }

  castCastle() {
    if (this.castle) {
      this.message('You already have a castle');
      this.audio.fail();
      return;
    }
    const p = this.player, t = this.terrain;
    const x = t.wrap(p.x + Math.cos(p.yaw) * 30), y = t.wrap(p.y + Math.sin(p.yaw) * 30);
    if (t.heightAt(x, y) < t.water + 1) {
      this.message('A castle needs dry land');
      this.audio.fail();
      return;
    }
    if (!this.spendMana(CONFIG.spells.castle.cost)) {
      this.message('Not enough mana');
      return;
    }
    this.castle = new Castle(t, x, y);
    this.balloons.push(new Balloon(this.castle));
    this.audio.castle();
    this.message('Your castle rises!', 4);
    this.depositMana(0);
  }

  castHeal() {
    const p = this.player;
    if (p.health >= CONFIG.player.maxHealth) return;
    if (!this.spendMana(CONFIG.spells.heal.cost)) return;
    p.health = Math.min(CONFIG.player.maxHealth, p.health + CONFIG.spells.heal.amount);
    this.audio.heal();
    this.burst(p.x, p.y, p.z - 2, 'possessionSpark', 14);
  }

  playerDied() {
    const p = this.player;
    p.alive = false;
    const lost = Math.floor(this.mana * 0.25);
    this.mana -= lost;
    this.explosion(p.x, p.y, p.z);
    this.message(`You were slain! Lost ${lost} mana`, 5);
    const home = this.castle ? [this.castle.x + 12, this.castle.y + 12] : [p.spawnX, p.spawnY];
    this.respawnAt = { t: 2, x: home[0], y: home[1] };
  }

  explosion(x, y, z) {
    this.effects.push({ x, y, z, t: 0, duration: 0.45 });
    this.burst(x, y, z, 'smoke', 6);
    this.burst(x, y, z, 'spark', 10);
    this.audio.explosion(this.distToPlayer(x, y));
  }

  particle(x, y, z, kind, spread = 0.3) {
    if (this.particles.length > 400) return;
    const def = PARTICLES[kind];
    this.particles.push({
      x, y, z, def,
      vx: (Math.random() - 0.5) * spread * 30,
      vy: (Math.random() - 0.5) * spread * 30,
      vz: def.rise + (Math.random() - 0.5) * spread * 20,
      life: def.life * (0.6 + Math.random() * 0.4),
    });
  }

  burst(x, y, z, kind, n) {
    for (let i = 0; i < n; i++) this.particle(x, y, z, kind, 1);
  }

  worldManaShare() {
    let loose = 0;
    for (const b of this.manaBalls) loose += b.value;
    for (const bl of this.balloons) loose += bl.cargo;
    const total = this.mana + loose;
    return total > 0 ? (this.mana / total) * 100 : 0;
  }

  update(dt) {
    this.time += dt;
    const t = this.terrain;
    const p = this.player;

    if (p.alive) p.update(dt, this);
    else {
      this.input.consumeMouse();
      this.respawnAt.t -= dt;
      if (this.respawnAt.t <= 0) {
        p.respawn(t.wrap(this.respawnAt.x), t.wrap(this.respawnAt.y), t);
        this.message('Resurrected', 2);
      }
    }
    if (this.input.wasPressed('KeyM')) this.message(this.audio.toggleMute() ? 'Sound off' : 'Sound on', 1.5);

    for (const b of this.manaBalls) b.update(dt, this);
    for (const pr of this.projectiles) pr.update(dt, this);
    for (const v of this.vultures) v.update(dt, this);
    for (const bl of this.balloons) bl.update(dt, this);
    for (const e of this.effects) e.t += dt;
    for (const q of this.particles) {
      q.life -= dt;
      q.x = t.wrap(q.x + q.vx * dt);
      q.y = t.wrap(q.y + q.vy * dt);
      q.z += q.vz * dt;
    }
    for (const m of this.messages) m.t -= dt;

    this.manaBalls = this.manaBalls.filter((b) => !b.dead);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
    this.vultures = this.vultures.filter((v) => !v.dead);
    this.effects = this.effects.filter((e) => e.t < e.duration);
    this.particles = this.particles.filter((q) => q.life > 0);
    this.messages = this.messages.filter((m) => m.t > 0);

    if (this.vultures.length < CONFIG.vultures) {
      this.vultureTimer += dt;
      if (this.vultureTimer > 15) {
        this.vultureTimer = 0;
        this.spawnVulture();
      }
    }

    if (!this.won && this.castle && this.worldManaShare() >= CONFIG.goalPercent) {
      this.won = true;
      this.audio.win();
      this.message(`Victory! You hold ${CONFIG.goalPercent}% of the world's mana`, 10);
    }

    this.audio.setWind(Math.min(1, p.speed / 90));
  }

  camera() {
    const p = this.player;
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: p.roll };
  }

  collectSprites() {
    const s = this.sprites;
    const out = [];
    for (const b of this.manaBalls) out.push(b.sprite(s));
    for (const pr of this.projectiles) out.push(pr.sprite(s));
    for (const v of this.vultures) out.push(v.sprite(s));
    for (const bl of this.balloons) out.push(bl.sprite(s));
    for (const e of this.effects) {
      const frame = Math.min(s.explosion.length - 1, Math.floor((e.t / e.duration) * s.explosion.length));
      out.push({ x: e.x, y: e.y, z: e.z, img: s.explosion[frame], size: 9 });
    }
    for (const q of this.particles) {
      out.push({ x: q.x, y: q.y, z: q.z, img: s[q.def.img], size: q.def.size });
    }
    return out;
  }
}
