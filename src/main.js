import { CONFIG } from './config.js';
import { Terrain } from './terrain.js';
import { Renderer } from './renderer.js';
import { buildSprites } from './sprites.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { World } from './world.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');

const seed = Number(new URLSearchParams(location.search).get('seed')) || CONFIG.seed;
const terrain = new Terrain(seed);
const renderer = new Renderer(canvas, terrain);
const input = new Input(canvas);
const audio = new Audio();
const world = new World({ terrain, sprites: buildSprites(), audio, input, renderer });
const hud = new Hud(canvas, terrain);

let running = false;

function start() {
  audio.start();
  input.lock();
  overlay.classList.add('hidden');
  running = true;
}

overlay.addEventListener('click', start);
canvas.addEventListener('click', () => {
  if (running && !input.locked) input.lock();
});
document.addEventListener('pointerlockchange', () => {
  // Leaving pointer lock (Esc) pauses the game.
  if (!input.locked && running) {
    running = false;
    overlay.classList.remove('hidden');
  }
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
  start: () => { running = true; overlay.classList.add('hidden'); },
};
