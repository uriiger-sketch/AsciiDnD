// Plays with the bot and writes a save at the start of each stage, for screenshots and tests.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Game } from '../src/game/game.js';
import { playChapter } from './bot.mjs';
const out = process.argv[2] || 'shots/saves';
mkdirSync(out, { recursive: true });
const g = new Game();
g.newGame(4242);
let last = -1;
const r = playChapter(g, { hook: (g) => { if (g.S.stage !== last && !g.over) { last = g.S.stage; writeFileSync(`${out}/stage${String(last).padStart(2, '0')}.json`, g.serialize()); } return false; } });
console.log('saves written to', out, '| run:', r.won ? 'won' : 'stopped at ' + r.stage, JSON.stringify(r.deaths));
