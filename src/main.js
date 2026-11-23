// SUNDOWN: boot. One canvas used as a text terminal, one game, one UI.
import { Term } from './ui/term.js';
import { UI } from './ui/ui.js';
import { makeSfx } from './ui/sfx.js';
import { Game } from './game/game.js';

const KEY = 'sundown.ascii.v2';
const store = {
  save(json) { try { localStorage.setItem(KEY, json); } catch (e) { /* storage unavailable: play on without saving */ } },
  load() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ } },
};

function start() {
  const canvas = document.getElementById('screen');
  const term = new Term(canvas);
  const game = new Game();
  const ui = new UI(term, game, makeSfx(), store);
  window.__ui = ui;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.focus();
    const [cx, cy] = term.cell(e);
    ui.tap(cx, cy);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (ui.key(e)) e.preventDefault();
  });
  addEventListener('resize', () => term.fit());
  addEventListener('pagehide', () => { if (ui.mode === 'play' && game.S && !game.over) store.save(game.serialize()); });

  const tick = (now) => {
    if (!window.__pause) ui.frame(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

try { start(); } catch (e) {
  console.error(e);
  window.__error = String((e && e.stack) || e);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f2ecd8;font:14px monospace;padding:16px;white-space:pre-wrap">SUNDOWN could not start on this device:\n' + String(e && e.message) + '</pre>');
}
