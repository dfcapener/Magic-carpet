// Keyboard + mouse state with pointer lock. Mouse deltas accumulate between
// frames and are consumed by the player each update.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last frame
    this.buttons = [false, false, false];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.joyX = 0; // analog stick from touch controls, -1..1
    this.joyY = 0;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.fill(false);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) this.buttons[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) this.buttons[e.button] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  lock() {
    // Optional: some frames and phones refuse it; arrow keys still work.
    try {
      this.canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {}
  }

  // Virtual key presses (used by on-screen touch buttons).
  press(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  release(code) {
    this.keys.delete(code);
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
