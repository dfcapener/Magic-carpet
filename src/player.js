import { CONFIG } from './config.js';

export class Player {
  constructor(x, y, terrain) {
    this.spawnX = x;
    this.spawnY = y;
    this.x = x;
    this.y = y;
    this.z = terrain.surfaceAt(x, y) + CONFIG.player.defaultHover;
    this.vx = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = -20; // horizon offset in framebuffer pixels (+ = look up)
    this.roll = 0;
    this.hover = CONFIG.player.defaultHover;
    this.health = CONFIG.player.maxHealth;
    this.alive = true;
    this.cooldowns = { fireball: 0, possession: 0 };
    this.hurtFlash = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt, world) {
    const P = CONFIG.player;
    const { input, terrain: t } = world;
    for (const k in this.cooldowns) this.cooldowns[k] -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);

    // Look: mouse (pointer lock) or arrow keys.
    const [mx, my] = input.consumeMouse();
    let yawRate = mx * P.mouseSens / Math.max(dt, 1e-3);
    this.yaw += mx * P.mouseSens;
    this.pitch -= my * 0.35;
    if (input.down('ArrowLeft')) { this.yaw -= P.turnSpeed * dt; yawRate -= P.turnSpeed; }
    if (input.down('ArrowRight')) { this.yaw += P.turnSpeed * dt; yawRate += P.turnSpeed; }
    if (input.down('ArrowUp')) this.pitch += 90 * dt;
    if (input.down('ArrowDown')) this.pitch -= 90 * dt;
    this.pitch = Math.max(-120, Math.min(80, this.pitch));

    // Move.
    const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const strafe = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const boost = input.down('ShiftLeft') ? 1.6 : 1;
    this.vx += (cos * fwd - sin * strafe * 0.8) * P.accel * boost * dt;
    this.vy += (sin * fwd + cos * strafe * 0.8) * P.accel * boost * dt;
    const drag = Math.exp(-P.drag * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x = t.wrap(this.x + this.vx * dt);
    this.y = t.wrap(this.y + this.vy * dt);

    // Altitude: hover above the highest ground just ahead so hills don't hit us.
    if (input.down('Space') || input.down('KeyE')) this.hover += 35 * dt;
    if (input.down('KeyQ') || input.down('ControlLeft')) this.hover -= 35 * dt;
    this.hover = Math.max(P.minHover, Math.min(P.maxHover, this.hover));
    let ground = t.surfaceAt(this.x, this.y);
    for (const k of [0.3, 0.7]) {
      ground = Math.max(ground, t.surfaceAt(this.x + this.vx * k, this.y + this.vy * k) - 2);
    }
    const target = ground + this.hover;
    this.z += (target - this.z) * Math.min(1, dt * 3);
    this.z = Math.max(this.z, t.surfaceAt(this.x, this.y) + P.minHover);

    // Bank into turns and strafes.
    const rollTarget = Math.max(-0.5, Math.min(0.5, -yawRate * 0.12 - strafe * 0.12));
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 4);

    if (this.health < P.maxHealth) this.health = Math.min(P.maxHealth, this.health + P.healthRegen * dt);

    // Spells.
    if (input.buttons[0] || input.down('KeyF')) this.tryCast(world, 'fireball');
    if (input.buttons[2] || input.down('KeyR')) this.tryCast(world, 'possession');
    if (input.wasPressed('KeyC')) world.castCastle();
    if (input.wasPressed('KeyH')) world.castHeal();
  }

  // Unit vector for where the crosshair points.
  aim(renderer) {
    const slope = this.pitch / renderer.F;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const len = Math.hypot(1, slope);
    return [cos / len, sin / len, slope / len];
  }

  tryCast(world, kind) {
    if (this.cooldowns[kind] > 0) return;
    const spell = CONFIG.spells[kind];
    this.cooldowns[kind] = spell.cooldown;
    if (!world.spendMana(spell.cost)) return;
    world.launch(kind, this);
  }

  damage(world, amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.hurtFlash = 1;
    world.audio.hurt();
    if (this.health <= 0) world.playerDied();
  }

  respawn(x, y, terrain) {
    this.x = x;
    this.y = y;
    this.vx = this.vy = 0;
    this.hover = CONFIG.player.defaultHover;
    this.z = terrain.surfaceAt(x, y) + this.hover + 20;
    this.health = CONFIG.player.maxHealth;
    this.alive = true;
  }
}
