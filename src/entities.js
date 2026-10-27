import { CONFIG } from './config.js';
import { MAT_NATURAL, MAT_STONE, MAT_COURTYARD, MAT_BANNER } from './terrain.js';

const dist2 = (t, ax, ay, bx, by) => {
  const dx = t.delta(bx - ax), dy = t.delta(by - ay);
  return dx * dx + dy * dy;
};

export class ManaBall {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.value = value;
    this.owner = 0; // 0 = neutral, 1 = player
    this.claimedBy = null; // balloon on its way to fetch it
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;
  }

  update(dt, world) {
    this.phase += dt * 2;
    this.z = world.terrain.surfaceAt(this.x, this.y) + 1.6 + Math.sin(this.phase) * 0.4;
  }

  sprite(s) {
    return { x: this.x, y: this.y, z: this.z, img: this.owner ? s.manaOwned : s.manaNeutral, size: 3 };
  }
}

export class Projectile {
  constructor(kind, x, y, z, vx, vy, vz) {
    Object.assign(this, { kind, x, y, z, vx, vy, vz });
    this.life = 2.5;
    this.dead = false;
    this.trail = 0;
  }

  update(dt, world) {
    const t = world.terrain;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    // Sub-step so fast bolts don't tunnel through thin castle walls.
    const steps = 3;
    for (let s = 0; s < steps && !this.dead; s++) {
      const h = dt / steps;
      this.x = t.wrap(this.x + this.vx * h);
      this.y = t.wrap(this.y + this.vy * h);
      this.z += this.vz * h;
      if (this.kind === 'fireball') this.checkCreatures(world);
      else this.checkMana(world);
      if (!this.dead && this.z <= t.surfaceAt(this.x, this.y)) this.hitGround(world);
    }
    this.trail -= dt;
    if (this.trail <= 0 && !this.dead) {
      this.trail = 0.03;
      world.particle(this.x, this.y, this.z, this.kind === 'fireball' ? 'spark' : 'possessionSpark');
    }
  }

  checkCreatures(world) {
    for (const v of world.vultures) {
      if (dist2(world.terrain, this.x, this.y, v.x, v.y) < 16 && Math.abs(v.z - this.z) < 4) {
        this.explode(world, false);
        return;
      }
    }
  }

  checkMana(world) {
    for (const b of world.manaBalls) {
      if (b.owner === 1) continue;
      if (dist2(world.terrain, this.x, this.y, b.x, b.y) < 25 && Math.abs(b.z - this.z) < 7) {
        b.owner = 1;
        this.dead = true;
        world.audio.claimed();
        world.burst(b.x, b.y, b.z, 'possessionSpark', 10);
        return;
      }
    }
  }

  hitGround(world) {
    if (this.kind === 'fireball') this.explode(world, true);
    else {
      this.dead = true;
      world.burst(this.x, this.y, this.z, 'possessionSpark', 5);
    }
  }

  explode(world, onGround) {
    this.dead = true;
    const t = world.terrain;
    world.explosion(this.x, this.y, this.z);
    if (onGround && t.heightAt(this.x, this.y) > t.water - 1) {
      t.crater(this.x, this.y, 4.5, 2.5);
    }
    const dmg = CONFIG.spells.fireball.damage;
    for (const v of world.vultures) {
      const d = Math.sqrt(dist2(t, this.x, this.y, v.x, v.y) + (v.z - this.z) ** 2);
      if (d < 9) v.hurt(world, dmg * (d < 4 ? 1 : 1 - (d - 4) / 5));
    }
  }

  sprite(s) {
    return { x: this.x, y: this.y, z: this.z, img: this.kind === 'fireball' ? s.fireball : s.possession, size: 2.4 };
  }
}

// The castle is not a sprite: it is carved into the heightmap itself, the
// same way the original's castles sit on (and can be blasted out of) terrain.
export class Castle {
  constructor(terrain, x, y) {
    this.terrain = terrain;
    this.x = Math.floor(x) + 0.5;
    this.y = Math.floor(y) + 0.5;
    this.level = 0;
    this.R = 24;
    const size = this.R * 2 + 1;
    this.baseH = new Float32Array(size * size);
    this.baseM = new Uint8Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = terrain.idx(this.x - this.R + i, this.y - this.R + j);
        this.baseH[j * size + i] = terrain.height[k];
        this.baseM[j * size + i] = terrain.material[k];
      }
    }
    this.B = Math.max(terrain.heightAt(this.x, this.y), terrain.water + 1.5);
    this.stamp();
  }

  get keepHeight() {
    return 10 + this.level * 4;
  }

  get homeZ() {
    return this.B + this.keepHeight + 6;
  }

  get halfSize() {
    return 5 + this.level * 2;
  }

  stamp() {
    const t = this.terrain;
    const { R, B, level } = this;
    const size = R * 2 + 1;
    const hs = this.halfSize;
    const wallH = 5 + level * 1.5;
    const towerH = wallH + 4 + level;
    const keep = 2 + (level >> 1);
    const cx = Math.floor(this.x), cy = Math.floor(this.y);

    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const k = (j + R) * size + (i + R);
        let h = this.baseH[k];
        let m = this.baseM[k];
        const ring = Math.max(Math.abs(i), Math.abs(j));
        const r = Math.hypot(i, j);

        // Flatten a plinth with a soft blend back into the landscape.
        const flat = hs + 3, blend = hs + 8;
        if (r <= flat) {
          h = B;
          m = MAT_NATURAL;
        } else if (r < blend) {
          const k2 = (r - flat) / (blend - flat);
          h = B + (h - B) * k2 * k2 * (3 - 2 * k2);
        }

        if (ring <= hs - 2) {
          h = B + 0.4;
          m = MAT_COURTYARD;
        }
        if (ring === hs || ring === hs - 1) {
          h = B + wallH + (((i + j) & 2) && ring === hs ? 1.5 : 0); // crenellations
          m = MAT_STONE;
        }
        const corner = Math.abs(Math.abs(i) - hs) <= 1 && Math.abs(Math.abs(j) - hs) <= 1;
        if (corner) {
          h = B + towerH;
          m = MAT_STONE;
        }
        if (Math.abs(i) <= keep && Math.abs(j) <= keep) {
          h = B + this.keepHeight - (Math.abs(i) === keep || Math.abs(j) === keep ? 2 : 0);
          m = MAT_STONE;
        }
        if (i === 0 && j === 0) {
          h = B + this.keepHeight + 4; // banner pole
          m = MAT_BANNER;
        }
        t.setCell(cx + i, cy + j, h, m);
      }
    }
    t.recolor(cx - R - 1, cy - R - 1, cx + R + 1, cy + R + 1);
  }

  setLevel(level) {
    if (level === this.level) return false;
    this.level = Math.min(level, 4);
    this.stamp();
    return true;
  }
}

export class Balloon {
  constructor(castle) {
    this.castle = castle;
    this.x = castle.x;
    this.y = castle.y;
    this.z = castle.homeZ;
    this.state = 'idle';
    this.target = null;
    this.cargo = 0;
    this.speed = 32;
  }

  update(dt, world) {
    const t = world.terrain;
    const c = this.castle;
    if (this.state === 'idle') {
      this.moveTo(dt, t, c.x, c.y, c.homeZ);
      const ball = world.findPossessedBall(this.x, this.y);
      if (ball) {
        ball.claimedBy = this;
        this.target = ball;
        this.state = 'outbound';
      }
      return;
    }
    if (this.state === 'outbound') {
      const b = this.target;
      if (b.dead) {
        this.state = 'idle';
        return;
      }
      const cruise = this.cruiseZ(t, b.x, b.y);
      const close = dist2(t, this.x, this.y, b.x, b.y) < 36;
      this.moveTo(dt, t, b.x, b.y, close ? b.z + 4 : cruise);
      if (dist2(t, this.x, this.y, b.x, b.y) < 6 && Math.abs(this.z - (b.z + 4)) < 3) {
        b.dead = true;
        this.cargo = b.value;
        this.target = null;
        this.state = 'return';
        world.audio.collect(world.distToPlayer(this.x, this.y));
      }
      return;
    }
    if (this.state === 'return') {
      const atHome = dist2(t, this.x, this.y, c.x, c.y) < 9;
      this.moveTo(dt, t, c.x, c.y, atHome ? c.homeZ : this.cruiseZ(t, c.x, c.y));
      if (atHome && Math.abs(this.z - c.homeZ) < 3) {
        world.depositMana(this.cargo);
        this.cargo = 0;
        this.state = 'idle';
      }
    }
  }

  // Fly high enough to clear the terrain a short way ahead.
  cruiseZ(t, tx, ty) {
    const dx = t.delta(tx - this.x), dy = t.delta(ty - this.y);
    const d = Math.hypot(dx, dy) || 1;
    let g = t.surfaceAt(this.x, this.y);
    for (let s = 4; s <= 24; s += 4) {
      const k = Math.min(1, s / d);
      g = Math.max(g, t.surfaceAt(this.x + dx * k, this.y + dy * k));
    }
    return Math.max(g + 14, this.castle.homeZ - 10);
  }

  moveTo(dt, t, tx, ty, tz) {
    const dx = t.delta(tx - this.x), dy = t.delta(ty - this.y);
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, this.speed * dt);
    if (d > 0.001) {
      this.x = t.wrap(this.x + (dx / d) * step);
      this.y = t.wrap(this.y + (dy / d) * step);
    }
    this.z += Math.max(-20 * dt, Math.min(20 * dt, tz - this.z));
    this.z = Math.max(this.z, t.surfaceAt(this.x, this.y) + 3);
  }

  sprite(s) {
    return { x: this.x, y: this.y, z: this.z, img: s.balloon, size: 9 };
  }
}

export class Vulture {
  constructor(x, y, z) {
    Object.assign(this, { x, y, z });
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.health = 60;
    this.state = 'wander';
    this.timer = 0;
    this.bite = 0;
    this.flap = Math.random();
    this.tx = x;
    this.ty = y;
    this.dead = false;
    this.screeched = false;
  }

  update(dt, world) {
    const t = world.terrain;
    const p = world.player;
    this.flap += dt * (this.state === 'attack' ? 6 : 3);
    this.bite -= dt;
    this.timer -= dt;
    const pd = Math.sqrt(dist2(t, this.x, this.y, p.x, p.y));

    let tx, ty, tz, speed;
    if (this.state === 'retreat') {
      tx = this.tx; ty = this.ty;
      tz = t.surfaceAt(this.x, this.y) + 40;
      speed = 50;
      if (this.timer <= 0) this.state = 'wander';
    } else if (pd < 110 && p.alive) {
      if (this.state !== 'attack' && !this.screeched) {
        world.audio.screech(pd);
        this.screeched = true;
      }
      this.state = 'attack';
      tx = p.x; ty = p.y; tz = p.z;
      speed = 58;
    } else {
      this.state = 'wander';
      this.screeched = false;
      if (dist2(t, this.x, this.y, this.tx, this.ty) < 100 || this.timer <= 0) {
        this.tx = t.wrap(this.x + (Math.random() - 0.5) * 160);
        this.ty = t.wrap(this.y + (Math.random() - 0.5) * 160);
        this.timer = 8;
      }
      tx = this.tx; ty = this.ty;
      tz = t.surfaceAt(this.x, this.y) + 28;
      speed = 32;
    }

    const dx = t.delta(tx - this.x), dy = t.delta(ty - this.y), dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const steer = 2.5 * dt;
    this.vx += ((dx / d) * speed - this.vx) * steer;
    this.vy += ((dy / d) * speed - this.vy) * steer;
    this.vz += ((dz / d) * speed - this.vz) * steer;
    this.x = t.wrap(this.x + this.vx * dt);
    this.y = t.wrap(this.y + this.vy * dt);
    this.z += this.vz * dt;
    const floor = t.surfaceAt(this.x, this.y) + 3;
    if (this.z < floor) {
      this.z = floor;
      this.vz = Math.max(0, this.vz);
    }

    if (this.state === 'attack' && this.bite <= 0) {
      const d3 = Math.hypot(t.delta(p.x - this.x), t.delta(p.y - this.y), p.z - this.z);
      if (d3 < 6) {
        p.damage(world, 9);
        this.bite = 1.2;
        this.state = 'retreat';
        this.timer = 1.8;
        this.tx = t.wrap(this.x + this.vx * 2);
        this.ty = t.wrap(this.y + this.vy * 2);
      }
    }
  }

  hurt(world, amount) {
    if (this.dead) return;
    this.health -= amount;
    this.state = 'retreat';
    this.timer = 0.6;
    if (this.health <= 0) {
      this.dead = true;
      world.explosion(this.x, this.y, this.z);
      world.dropMana(this.x, this.y, 12 + Math.floor(Math.random() * 12));
    }
  }

  sprite(s) {
    return { x: this.x, y: this.y, z: this.z, img: s.vulture[Math.floor(this.flap) & 1], size: 4.5 };
  }
}
