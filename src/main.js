import { CONFIG } from './config.js';
import { Terrain } from './terrain.js';
import { Renderer } from './renderer.js';
import { buildSprites } from './sprites.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { World } from './world.js';
import { Hud } from './hud.js';
import { TouchControls, isTouchDevice } from './touch.js';

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');

const seed = Number(new URLSearchParams(location.search).get('seed')) || CONFIG.seed;
const terrain = new Terrain(seed);
const renderer = new Renderer(canvas, terrain);
const input = new Input(canvas);
const audio = new Audio();
const touch = isTouchDevice();
const world = new World({ terrain, sprites: buildSprites(), audio, input, renderer, touch });
const hud = new Hud(canvas, terrain, { touch });

let running = false;

function start() {
  audio.start();
  if (touch) {
    // Best effort: Android browsers allow fullscreen, iOS Safari ignores it.
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    input.lock();
  }
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  running = true;
}

function pause() {
  running = false;
  document.body.classList.remove('playing');
  overlay.classList.remove('hidden');
}

if (touch) {
  document.body.classList.add('touch');
  new TouchControls(input, canvas, { onPause: pause });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) pause();
});

overlay.addEventListener('click', start);
canvas.addEventListener('click', () => {
  if (running && !touch && !input.locked) input.lock();
});
document.addEventListener('pointerlockchange', () => {
  // Leaving pointer lock (Esc) pauses the game.
  if (!input.locked && running) pause();
});
window.addEventListener('resize', () => renderer.resize());
renderer.resize();

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += elapsed;
    while (acc >= STEP) {
      world.update(STEP);
      input.endFrame();
      acc -= STEP;
    }
  }
  renderer.render(world.camera(), world.collectSprites(), world.time);
  hud.draw(world, elapsed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handle for debugging and the headless smoke test.
window.__game = {
  world, terrain, renderer, input,
  start: () => { running = true; overlay.classList.add('hidden'); document.body.classList.add('playing'); },
};
