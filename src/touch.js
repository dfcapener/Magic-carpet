// On-screen controls for phones and tablets. Everything feeds the existing
// Input object: the stick sets an analog move axis, dragging elsewhere acts
// like mouse look, and buttons press/release the same key codes the keyboard
// uses, so the game logic doesn't need to know about touch at all.

export const isTouchDevice = () =>
  window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const LOOK_GAIN = 2.2; // touch drags need more turn per pixel than a mouse
const STICK_RADIUS = 55; // CSS px

const BUTTONS = [
  // [id, label, key code, hold?]
  ['fire', 'Fire', 'KeyF', true],
  ['possess', 'Claim', 'KeyR', true],
  ['up', '▲', 'Space', true],
  ['down', '▼', 'KeyQ', true],
  ['castle', 'Castle', 'KeyC', false],
  ['heal', 'Heal', 'KeyH', false],
];

export class TouchControls {
  constructor(input, canvas, { onPause }) {
    this.input = input;
    this.stick = null; // { id, x0, y0 }
    this.looks = new Map(); // touch id -> last {x, y}

    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="stick-base"><div class="stick-knob"></div></div>
      <button class="tbtn pause" aria-label="Pause">❚❚</button>
      ${BUTTONS.map(([id, label]) => `<button class="tbtn ${id}">${label}</button>`).join('')}
    `;
    document.body.appendChild(root);
    this.base = root.querySelector('.stick-base');
    this.knob = root.querySelector('.stick-knob');

    for (const [id, , code, hold] of BUTTONS) {
      const el = root.querySelector(`.${id}`);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('on');
        input.press(code);
        if (!hold) setTimeout(() => input.release(code), 50);
      });
      const up = () => {
        el.classList.remove('on');
        if (hold) input.release(code);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
    root.querySelector('.pause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPause();
    });

    // preventDefault on touchstart stops the browser synthesising mouse
    // events (which would otherwise fire spells) and scrolling/zooming.
    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => this.start(e), opts);
    canvas.addEventListener('touchmove', (e) => this.move(e), opts);
    canvas.addEventListener('touchend', (e) => this.end(e), opts);
    canvas.addEventListener('touchcancel', (e) => this.end(e), opts);
  }

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      // Lower-left area drives the floating stick; anywhere else looks around.
      if (!this.stick && t.clientX < window.innerWidth * 0.45 && t.clientY > window.innerHeight * 0.35) {
        this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
        this.base.style.left = `${t.clientX}px`;
        this.base.style.top = `${t.clientY}px`;
        this.base.classList.add('on');
        this.setKnob(0, 0);
      } else {
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }

  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        let dx = t.clientX - this.stick.x0, dy = t.clientY - this.stick.y0;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) {
          dx *= STICK_RADIUS / d;
          dy *= STICK_RADIUS / d;
        }
        this.setKnob(dx, dy);
        this.input.joyX = dx / STICK_RADIUS;
        this.input.joyY = dy / STICK_RADIUS;
      } else if (this.looks.has(t.identifier)) {
        const last = this.looks.get(t.identifier);
        this.input.mouseDX += (t.clientX - last.x) * LOOK_GAIN;
        this.input.mouseDY += (t.clientY - last.y) * LOOK_GAIN;
        last.x = t.clientX;
        last.y = t.clientY;
      }
    }
  }

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        this.stick = null;
        this.input.joyX = this.input.joyY = 0;
        this.base.classList.remove('on');
      }
      this.looks.delete(t.identifier);
    }
  }

  setKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
