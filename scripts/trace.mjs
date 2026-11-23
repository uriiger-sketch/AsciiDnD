// Debug: play with the bot until `stage`, then print the local map each turn for a while.
import { Game } from '../src/game/game.js';
import { TILE, KIND } from '../src/game/data.js';
import { botAct, playChapter } from './bot.mjs';
const stage = +(process.argv[2] || 9), seed = +(process.argv[3] || 1000), skip = +(process.argv[4] || 0), n = +(process.argv[5] || 12);
const g = new Game();
g.newGame(seed);
export function view(g, r = 16, rr = 8) {
  const L = g.L, p = g.p, d = g.danger();
  for (let y = p.y - rr; y <= p.y + rr; y++) {
    let s = '';
    for (let x = p.x - r; x <= p.x + r; x++) {
      if (!L.inb(x, y)) { s += ' '; continue; }
      const i = y * L.w + x, a = L.occ[i];
      if (a === p) s += '@';
      else if (a) s += a.team === 2 ? 'N' : KIND[a.kind].ch;
      else if (d.has(i)) s += '!';
      else if (L.items.has(i)) s += '$';
      else s += L.glyph[i] ? String.fromCharCode(L.glyph[i]) : TILE[L.t[i]].ch;
    }
    console.log(s);
  }
  console.log(`turn ${g.S.turn} stage ${g.S.stage} hp ${p.hp} ${p.weapon} loaded ${JSON.stringify(p.loaded)} ammo ${p.ammo.b} | ` + g.S.log.slice(-2).map((m) => m.t).join(' | '));
}
let count = 0;
playChapter(g, { maxDeaths: 40, hook: (g, a, why, goal) => {
  if (g.S.stage < stage) return false;
  if (count++ < skip) return false;
  view(g);
  console.log('next:', JSON.stringify(a), why, goal, '\n');
  return count > skip + n;
} });
