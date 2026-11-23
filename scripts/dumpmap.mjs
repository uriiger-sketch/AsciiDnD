// Prints a level as plain text and checks every point of interest can be walked to.
import { buildWorld, buildMine, flow } from '../src/game/world.js';
import { TILE } from '../src/game/data.js';
const which = process.argv[2] || 'world';
const lv = which === 'mine' ? buildMine() : buildWorld();
const [x0, y0, x1, y1] = (process.argv[3] || `0,0,${lv.w - 1},${lv.h - 1}`).split(',').map(Number);
const mark = new Map(Object.entries(lv.poi).map(([k, [x, y]]) => [y * lv.w + x, k]));
for (let y = y0; y <= y1; y++) {
  let s = '';
  for (let x = x0; x <= x1; x++) { const i = y * lv.w + x; s += lv.glyph[i] ? String.fromCharCode(lv.glyph[i]) : TILE[lv.t[i]].ch; }
  console.log(String(y).padStart(3) + ' ' + s);
}
const from = which === 'mine' ? lv.poi.up : lv.poi.start;
const d = flow(lv, from[0], from[1], 2000);
const bad = Object.entries(lv.poi).filter(([k, [x, y]]) => d[y * lv.w + x] === 32767).map(([k]) => k);
// people stand next to things; a POI on a blocked cell is fine if a neighbour is reachable
const reallyBad = bad.filter((k) => { const [x, y] = lv.poi[k]; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (d[(y + j) * lv.w + x + i] !== 32767) return false; return true; });
console.error('unreachable:', reallyBad.join(', ') || 'none', '| on blocked cells:', bad.join(', ') || 'none');
