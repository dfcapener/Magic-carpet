// Tiny WebAudio synth for sound effects; no sample files needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.wind = null;
    this.muted = false;
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise(2);
    this.startWind();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  makeNoise(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.wind = { filter, gain };
  }

  setWind(speed01) {
    if (!this.wind) return;
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(0.03 + speed01 * 0.12, t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(250 + speed01 * 700, t, 0.2);
  }

  noise(duration, { type = 'lowpass', from = 2000, to = 200, gain = 0.6, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  tone(freq, duration, { type = 'sine', to = freq, gain = 0.25, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  // Volume falls off with distance (world units) from the listener.
  fade(dist) {
    return Math.max(0, 1 - dist / 300);
  }

  fireball() {
    this.noise(0.35, { type: 'bandpass', from: 1800, to: 300, gain: 0.5 });
  }

  explosion(dist = 0) {
    const v = this.fade(dist);
    if (v <= 0) return;
    this.noise(0.8, { from: 1200, to: 60, gain: 0.9 * v });
    this.tone(90, 0.5, { type: 'triangle', to: 40, gain: 0.4 * v });
  }

  possess() {
    this.tone(660, 0.25, { type: 'triangle', to: 990, gain: 0.2 });
  }

  claimed() {
    this.tone(880, 0.15, { gain: 0.2 });
    this.tone(1320, 0.3, { gain: 0.18, delay: 0.08 });
  }

  collect(dist = 0) {
    const v = this.fade(dist) * 0.8 + 0.2;
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, { gain: 0.15 * v, delay: i * 0.07 }));
  }

  hurt() {
    this.tone(180, 0.25, { type: 'square', to: 80, gain: 0.25 });
  }

  screech(dist) {
    const v = this.fade(dist);
    if (v > 0) this.tone(1400, 0.3, { type: 'sawtooth', to: 700, gain: 0.08 * v });
  }

  castle() {
    this.noise(1.6, { from: 400, to: 40, gain: 0.8 });
    [262, 330, 392, 523].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', gain: 0.12, delay: 0.2 + i * 0.12 }));
  }

  heal() {
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, { gain: 0.12, delay: i * 0.05 }));
  }

  fail() {
    this.tone(200, 0.15, { type: 'square', gain: 0.12 });
  }

  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.2, delay: i * 0.15 }));
  }
}
