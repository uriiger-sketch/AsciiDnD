// A few synthesized sounds. Nothing plays until the player has touched the page.
export function makeSfx() {
  let ctx = null;
  const tone = (type, f0, f1, dur, vol, delay = 0) => {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const play = (name) => {
    if (play.muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      if (name === 'letter') { tone('triangle', 880, 1320, 0.12, 0.12); tone('triangle', 1320, 1760, 0.1, 0.08, 0.07); }
      else if (name === 'word') tone('square', 190, 120, 0.07, 0.06);
      else if (name === 'good') { tone('triangle', 523, 523, 0.25, 0.1); tone('triangle', 659, 659, 0.25, 0.1, 0.09); tone('triangle', 784, 784, 0.4, 0.1, 0.18); }
      else if (name === 'bad') tone('sawtooth', 140, 70, 0.3, 0.07);
      else if (name === 'bell') { tone('sine', 660, 650, 1.2, 0.14); tone('sine', 1320, 1300, 0.7, 0.05); }
    } catch (e) { /* no audio on this device: carry on silently */ }
  };
  play.muted = false;
  return play;
}
