// Plays with the bot and saves a few telling moments (for screenshots).
import { writeFileSync, mkdirSync } from 'node:fs';
import { Game } from '../src/game/game.js';
import { playChapter } from './bot.mjs';
mkdirSync('shots/saves', { recursive: true });
const want = {
  town: (g) => g.S.stage === 3 && g.p.x > 60 && g.p.x < 70,
  pack: (g) => g.S.stage === 4 && g.seenFoes().length >= 3 && g.inFight,
  camp: (g) => g.S.stage === 7 && g.seenFoes().length >= 3 && g.inFight,
  canyon: (g) => g.S.stage === 9 && g.danger().size > 6 && g.seenFoes().length >= 2,
  mine: (g) => g.S.lv === 'mine' && g.seenFoes().length >= 2,
  ash: (g) => g.S.lv === 'mine' && g.seenFoes().some((a) => a.kind === 'ash'),
  finale: (g) => g.S.stage === 15 && g.S.flags.wave >= 2 && g.danger().size > 4 && g.seenFoes().length >= 3,
  crowe: (g) => g.S.stage === 15 && g.seenFoes().some((a) => a.kind === 'crowe' && a.fan),
};
for (let seed = 1; seed < 6 && Object.keys(want).length; seed++) {
  const g = new Game();
  g.newGame(seed * 9973);
  playChapter(g, { hook: (g) => {
    if (g.over || g.dialog) return false;
    for (const k in want) if (want[k](g)) { writeFileSync(`shots/saves/${k}.json`, g.serialize()); delete want[k]; console.log('saved', k, 'at turn', g.S.turn); }
    return false;
  } });
}
console.log('missing:', Object.keys(want).join(', ') || 'none');
