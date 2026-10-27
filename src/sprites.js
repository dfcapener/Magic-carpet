import { packRGB } from './terrain.js';

// All sprite art is generated here: either procedurally or from tiny ASCII
// pixel-art tables. Images are { w, h, data: Uint32Array } with 0 = transparent.

function makeImage(w, h, fn) {
  const data = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      if (c) data[y * w + x] = packRGB(c[0], c[1], c[2]);
    }
  }
  return { w, h, data };
}

function fromAscii(rows, palette) {
  const h = rows.length, w = rows[0].length;
  return makeImage(w, h, (x, y) => palette[rows[y][x]] || null);
}

function sphere(size, [r, g, b], glow = 0) {
  const c = (size - 1) / 2;
  return makeImage(size, size, (x, y) => {
    const dx = (x - c) / c, dy = (y - c) / c;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    const light = Math.max(0, -dx * 0.5 - dy * 0.6 + nz * 0.62);
    const k = 0.35 + light * 0.9 + glow;
    const spec = Math.pow(light, 18) * 255;
    return [r * k + spec, g * k + spec, b * k + spec];
  });
}

function glowBall(size, inner, outer) {
  const c = (size - 1) / 2;
  return makeImage(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / c;
    if (d > 1) return null;
    if (d < 0.45) return inner;
    if ((x + y) & 1 && d > 0.8) return null; // dithered edge
    return outer;
  });
}

const VULTURE_UP = [
  'X..............X',
  'XX............XX',
  '.XX..........XX.',
  '.XXX........XXX.',
  '..XXX......XXX..',
  '...XXXXHHXXXX...',
  '....XXXBBXXX....',
  '......BBBB......',
  '.......BB.......',
  '......T..T......',
];

const VULTURE_DOWN = [
  '................',
  '................',
  '................',
  '.......HH.......',
  '....XXXBBXXX....',
  '..XXXXXBBXXXXX..',
  '.XXX..BBBB..XXX.',
  'XX.....BB.....XX',
  'X......TT......X',
  '................',
];

const VULTURE_PAL = {
  X: [70, 50, 40],
  H: [200, 60, 50],
  B: [110, 85, 60],
  T: [230, 190, 60],
};

const BALLOON = [
  '...CCCCCC...',
  '..CWWCCCCC..',
  '.CWWCCCCCCc.',
  'CCWCCCCCCCcc',
  'CCCCCCCCCCcc',
  'CCCCCCCCCCcc',
  'CCCCCCCCCCcc',
  '.CCCCCCCCcc.',
  '.cCCCCCCccc.',
  '..ccCCCccc..',
  '...cccccc...',
  '....r..r....',
  '....r..r....',
  '....r..r....',
  '....bbbb....',
  '....bbbb....',
];

function balloon([r, g, b]) {
  return fromAscii(BALLOON, {
    C: [r, g, b],
    c: [r * 0.6, g * 0.6, b * 0.6],
    W: [255, 240, 220],
    r: [60, 40, 30],
    b: [140, 90, 40],
  });
}

function explosionFrame(t) {
  const size = 24, c = (size - 1) / 2;
  return makeImage(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / c;
    const ring = 0.25 + t * 0.75;
    if (d > ring) return null;
    const inner = d / ring;
    const noise = ((x * 7 + y * 13 + t * 31) | 0) % 5;
    if (t > 0.6 && inner < (t - 0.6) * 2 && noise > 1) return null; // hollowing
    if (inner < 0.4) return [255, 250, 200];
    if (inner < 0.75) return [255, 170 - noise * 10, 40];
    return [200 - t * 120, 60 + noise * 10, 30];
  });
}

export const PLAYER_COLOR = [230, 60, 40];

export function buildSprites() {
  return {
    manaNeutral: sphere(15, [215, 215, 225]),
    manaOwned: sphere(15, [255, 200, 60], 0.15),
    fireball: glowBall(11, [255, 245, 190], [255, 120, 30]),
    possession: glowBall(11, [255, 255, 255], [255, 210, 70]),
    spark: glowBall(5, [255, 230, 150], [255, 130, 40]),
    smoke: glowBall(7, [120, 115, 110], [80, 78, 75]),
    vulture: [fromAscii(VULTURE_UP, VULTURE_PAL), fromAscii(VULTURE_DOWN, VULTURE_PAL)],
    balloon: balloon(PLAYER_COLOR),
    explosion: [0.1, 0.3, 0.5, 0.7, 0.9].map(explosionFrame),
  };
}
