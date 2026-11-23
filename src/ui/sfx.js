// A handful of synthesized sounds. Silent until the player first touches the page.
export function makeSfx() {
  let ctx = null, noise = null;
  const tone = (type, f0, f1, dur, vol, at = 0) => {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  };
  const burst = (dur, vol, freq, at = 0) => {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noise;
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  };
  const play = (name, delay = 0) => {
    if (play.muted) return;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      const at = delay / 1000;
      switch (name) {
        case 'shot': burst(0.16, 0.35, 3800, at); tone('square', 180, 50, 0.09, 0.12, at); break;
        case 'rifle': burst(0.28, 0.4, 5200, at); tone('square', 140, 40, 0.14, 0.14, at); break;
        case 'boom2': burst(0.3, 0.45, 2200, at); tone('sawtooth', 110, 35, 0.2, 0.18, at); break;
        case 'boom': burst(0.6, 0.5, 900, at); tone('sine', 90, 28, 0.5, 0.3, at); break;
        case 'click': tone('square', 900, 700, 0.03, 0.08, at); break;
        case 'load': tone('square', 500, 420, 0.03, 0.07, at); tone('square', 620, 520, 0.03, 0.07, at + 0.07); break;
        case 'cock': tone('square', 380, 300, 0.04, 0.09, at); tone('square', 520, 480, 0.03, 0.08, at + 0.06); break;
        case 'hurt': tone('sawtooth', 220, 90, 0.18, 0.16, at); break;
        case 'die': tone('triangle', 200, 60, 0.25, 0.1, at); break;
        case 'stab': burst(0.06, 0.2, 6000, at); break;
        case 'swish': burst(0.08, 0.1, 3000, at); break;
        case 'pick': tone('triangle', 880, 1320, 0.09, 0.09, at); break;
        case 'use': tone('triangle', 440, 660, 0.15, 0.08, at); break;
        case 'door': tone('square', 120, 90, 0.08, 0.06, at); break;
        case 'fuse': burst(0.35, 0.08, 7000, at); break;
        case 'alert': tone('square', 660, 660, 0.08, 0.1, at); tone('square', 880, 880, 0.12, 0.1, at + 0.09); break;
        case 'rattle': for (let i = 0; i < 7; i++) burst(0.03, 0.12, 8000, at + i * 0.05); break;
        case 'hooves': for (let i = 0; i < 5; i++) tone('sine', 110, 60, 0.05, 0.2, at + i * 0.06); break;
        case 'neigh': tone('sawtooth', 700, 380, 0.3, 0.07, at); break;
        case 'quest': tone('triangle', 523, 523, 0.14, 0.09, at); tone('triangle', 784, 784, 0.25, 0.09, at + 0.12); break;
        case 'deed': tone('triangle', 523, 523, 0.12, 0.1, at); tone('triangle', 659, 659, 0.12, 0.1, at + 0.1); tone('triangle', 1047, 1047, 0.35, 0.1, at + 0.2); break;
      }
    } catch (e) { /* no audio here: carry on silently */ }
  };
  play.muted = false;
  return play;
}
