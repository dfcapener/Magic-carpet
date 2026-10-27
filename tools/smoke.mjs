// Headless smoke test: boots the game, flies around, casts spells and checks
// that the core loop (castle, possession, balloons, combat) works without errors.
// Usage: node tools/smoke.mjs [screenshotDir]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

// require() honours NODE_PATH / global installs, which ESM imports do not.
const { chromium } = createRequire(import.meta.url)('playwright');

const outDir = process.argv[2];
const server = await serve(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const fail = async (msg) => {
  console.error('FAIL:', msg);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__game);
if (outDir) await page.screenshot({ path: `${outDir}/title.png` });
await page.evaluate(() => window.__game.start());

// Fly forward a bit, then raise a castle.
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
await page.keyboard.press('KeyC');
await page.waitForTimeout(300);
let s = await page.evaluate(() => ({ castle: !!window.__game.world.castle, mana: window.__game.world.mana }));
if (!s.castle) {
  // Facing water perhaps: try other headings.
  for (let i = 0; i < 8 && !s.castle; i++) {
    await page.evaluate(() => { window.__game.world.player.yaw += Math.PI / 4; });
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(100);
    s = await page.evaluate(() => ({ castle: !!window.__game.world.castle, mana: window.__game.world.mana }));
  }
}
if (!s.castle) await fail('castle was not created');
console.log('castle raised, mana', s.mana);

// Possess the nearest mana ball by aiming straight at it.
const before = await page.evaluate(() => {
  const g = window.__game, w = g.world, p = w.player, t = g.terrain;
  let best = null, bd = Infinity;
  for (const b of w.manaBalls) {
    const d = Math.hypot(t.delta(b.x - p.x), t.delta(b.y - p.y));
    if (d < bd) { bd = d; best = b; }
  }
  // Park the carpet near it and aim.
  p.x = t.wrap(best.x - 30); p.y = best.y; p.vx = p.vy = 0;
  p.z = t.surfaceAt(p.x, p.y) + 20;
  p.yaw = 0;
  window.__target = best;
  return { owned: w.manaBalls.filter((b) => b.owner === 1).length };
});
for (let i = 0; i < 20; i++) {
  const owned = await page.evaluate(() => {
    const g = window.__game, p = g.world.player, b = window.__target, t = g.terrain;
    const dx = t.delta(b.x - p.x), dy = t.delta(b.y - p.y);
    p.yaw = Math.atan2(dy, dx);
    p.pitch = ((b.z - p.z) / Math.hypot(dx, dy)) * g.renderer.F;
    p.cooldowns.possession = 0;
    g.world.player.tryCast(g.world, 'possession');
    return b.owner === 1;
  });
  await page.waitForTimeout(150);
  if (owned) break;
}
const owned = await page.evaluate(() => window.__target.owner === 1);
if (!owned) await fail('possession did not claim the targeted mana ball');
console.log('mana ball possessed (owned before:', before.owned, ')');
if (outDir) await page.screenshot({ path: `${outDir}/flight.png` });

// Balloons should fetch it and deposit at the castle.
const manaBefore = await page.evaluate(() => window.__game.world.mana);
await page.waitForFunction(() => window.__target.dead, null, { timeout: 60000 }).catch(() => fail('balloon never collected the mana'));
await page.waitForFunction((m) => window.__game.world.mana > m, manaBefore, { timeout: 60000 }).catch(() => fail('mana never deposited'));
console.log('balloon delivered mana:', await page.evaluate(() => window.__game.world.mana));

// Fireball a vulture.
const killed = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = w.player, t = g.terrain;
  const v = w.vultures[0];
  const n = w.vultures.length;
  v.x = t.wrap(p.x + 25); v.y = p.y; v.z = p.z; v.state = 'retreat'; v.timer = 99; v.tx = v.x; v.ty = v.y;
  v.vx = v.vy = v.vz = 0;
  for (let i = 0; i < 8 && !v.dead; i++) {
    // Re-aim every shot: a wounded vulture climbs away.
    const dx = t.delta(v.x - p.x), dy = t.delta(v.y - p.y);
    p.yaw = Math.atan2(dy, dx);
    p.pitch = ((v.z - p.z + 1.5) / Math.hypot(dx, dy)) * g.renderer.F;
    p.cooldowns.fireball = 0;
    w.mana += 10;
    p.tryCast(w, 'fireball');
    await new Promise((r) => setTimeout(r, 300));
  }
  return { dead: v.dead, before: n, after: w.vultures.length };
});
if (!killed.dead) await fail('fireballs did not kill the vulture');
console.log('vulture killed', killed);

// Crater check: fire at the ground and confirm the terrain changed.
const cratered = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = w.player;
  const v0 = g.terrain.version;
  p.pitch = -110;
  p.cooldowns.fireball = 0;
  w.mana += 10;
  p.tryCast(w, 'fireball');
  await new Promise((r) => setTimeout(r, 800));
  return g.terrain.version > v0;
});
if (!cratered) await fail('fireball did not deform terrain');
console.log('terrain deformed by fireball');
if (outDir) await page.screenshot({ path: `${outDir}/combat.png` });

const fps = await page.evaluate(() => new Promise((resolve) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => (++n < 60 ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0)));
  requestAnimationFrame(tick);
}));
console.log('fps (headless, software GL):', fps.toFixed(1));

if (errors.length) await fail('page errors:\n' + errors.join('\n'));
console.log('PASS');
await browser.close();
server.close();
