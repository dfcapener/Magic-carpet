// Central tunables. Units: 1 world unit = 1 heightmap cell.
export const CONFIG = {
  mapBits: 9, // 512x512 wrapping world
  seed: 1994,
  waterLevel: 28,
  maxHeight: 110,

  screenW: 320,
  screenH: 200,
  fov: (70 * Math.PI) / 180,
  drawDistance: 420,

  sky: { top: [52, 92, 170], horizon: [190, 205, 220] },

  player: {
    accel: 140,
    drag: 2.2,
    turnSpeed: 2.2, // keyboard turn (rad/s)
    mouseSens: 0.0025,
    minHover: 4,
    defaultHover: 22,
    maxHover: 90,
    maxHealth: 100,
    healthRegen: 2.5, // per second
  },

  spells: {
    fireball: { cost: 2, cooldown: 0.25, speed: 260, damage: 34 },
    possession: { cost: 3, cooldown: 0.4, speed: 300 },
    castle: { cost: 40 },
    heal: { cost: 25, amount: 50 },
  },

  startMana: 100,
  manaBalls: 70,
  vultures: 7,
  goalPercent: 60,
  castleLevels: [0, 150, 350, 700, 1200], // stored mana needed for level n
};
