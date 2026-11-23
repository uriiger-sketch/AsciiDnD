// Headless playthroughs:  node scripts/sim.mjs [runs] [--v]
import { Game } from '../src/game/game.js';
import { playChapter } from './bot.mjs';
const runs = +(process.argv[2] || 1), verbose = process.argv.includes('--v');
const tally = {}, wins = [], by = {};
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const g = new Game();
  g.newGame(1000 + i * 7919);
  const r = playChapter(g, { log: verbose ? console.log : null, trial: i % 2 === 0 });
  for (const s in r.deaths) tally[s] = (tally[s] || 0) + r.deaths[s];
  for (const s in r.by || {}) by[s] = (by[s] || 0) + r.by[s];
  wins.push(r.won);
  console.log(`run ${i}: ${r.won ? 'WON' : 'stopped at stage ' + r.stage} in ${r.turns} turns, deaths ${JSON.stringify(r.deaths)}, kills ${r.stats.kills}, hit ${Math.round((100 * r.stats.hits) / Math.max(1, r.stats.shots))}%, perks ${r.perks.join(',')} ${r.notes.join('; ')}`);
}
console.log('killed by:', JSON.stringify(by));
console.log(`\n${wins.filter(Boolean).length}/${runs} finished. Deaths per stage (total over runs): ${JSON.stringify(tally)}  [${Date.now() - t0} ms]`);
