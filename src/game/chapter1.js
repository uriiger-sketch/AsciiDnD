// CHAPTER ONE: NOBODY
//
// You walk into Sundown with no letters at all. By evening you have put two words back
// together, taken one apart on purpose, and watched a man steal the S off the town.

import { Template } from '../engine/batch.js';
import { KIND, emitFire } from '../engine/particles.js';
import { m4, clamp, TAU } from '../engine/math.js';
import { SPOT, PLACES } from '../world/world.js';
import { RAIL_Z } from '../world/land.js';
import { horseAndRider, poseHorse, Rider } from '../world/actors.js';

const SOUTH = -Math.PI / 2, NORTH = Math.PI / 2, EAST = 0, WEST = Math.PI;
const DEPOT = [-8, 113.2];
const FEED = 'FEED & GRAIN';

export function chapter1(g) {
  const S = () => g.S;
  const F = () => g.S.flags;
  const land = g.land, gl = g.engine.gl;
  const say = (who, t) => g.say(who, t);
  const has = (ch) => g.tc.count(ch) > 0;
  const good = () => g.sfx && g.sfx('good');

  // ------------------------------------------------------------------ the cast
  const ezra = g.addNpc({ id: 'ezra', name: 'EZRA QUILL', x: -16, z: 113.3, yaw: EAST, look: { hat: 'bowler', hatCol: 0x2c2c34, shirt: 0xd8d0c0, pants: 0x3a3a40, hair: 0x8a8a88 } });
  const odalys = g.addNpc({ id: 'odalys', name: 'ODALYS VANE', x: -96, z: -7.0, yaw: SOUTH, look: { hat: 'wide', hatCol: 0x8a6a48, shirt: 0x6a7f96, pants: 0x5a4634, bandana: 0xc9a94e, skin: 0x9a6a48 } });
  const bram = g.addNpc({ id: 'bram', name: 'BRAM ASHDOWN', x: -78.4, z: -6.6, yaw: SOUTH, idle: 'work', look: { shirt: 0x8a4a3a, pants: 0x3a3028, apron: 0x2e2420, beard: 0x2a2019, hair: 0x2a2019, skin: 0xa87858 } });
  const wren = g.addNpc({ id: 'wren', name: 'WIDOW WREN', x: SPOT.grave[0] + 1.9, z: SPOT.grave[1] + 1.5, yaw: WEST, look: { hat: 'bonnet', hatCol: 0x2a2630, dress: 0x4a4458, shirt: 0x4a4458, hair: 0xb8b4ac, skin: 0xc9a088 } });
  const marisol = g.addNpc({ id: 'marisol', name: 'MARISOL CRANE', x: -44, z: -7.4, yaw: SOUTH, look: { dress: 0xa8324a, shirt: 0xa8324a, hair: 0x1a1210, skin: 0xb07a56 } });
  const ansel = g.addNpc({ id: 'ansel', name: 'ANSEL TRIM', x: -66, z: 7.4, yaw: NORTH, look: { shirt: 0xe8e4da, coat: 0xe8e4da, pants: 0x3a3a40, hair: 0x7a5630, skin: 0xd0a888 } });
  const fenn = g.addNpc({ id: 'fenn', name: 'TOBIAS FENN', x: -96.5, z: 7.4, yaw: NORTH, look: { hat: 'wide', hatCol: 0xc9b070, shirt: 0x7b8568, pants: 0x6a5a40, skin: 0xc09878 } });
  const pike = g.addNpc({ id: 'pike', name: 'SHERIFF PIKE', x: 11, z: -7.4, yaw: SOUTH, look: { hat: 'wide', hatCol: 0x2a2622, coat: 0x6a5a48, shirt: 0x8a7a62, pants: 0x3a3028, star: true, beard: 0x8a8a88, hair: 0x8a8a88 } });
  const hollis = g.addNpc({ id: 'hollis', name: 'HOLLIS REED', x: -20, z: 7.4, yaw: NORTH, look: { hat: 'bowler', hatCol: 0x4a3a2a, shirt: 0xb89a50, apron: 0xd8d0c0, pants: 0x4a4038 } });

  // Dot, the mare. A bare horse; she becomes the way out of town.
  const dotTpl = new Template(gl, horseAndRider(0x9a8f80, null, { rider: false }), 61);
  const dot = g.addThing({ id: 'dot', name: 'DOT, a grey mare', x: -100, z: -45, r: 3.6, label: 2.3, solid: 0.9, yaw: 0.6 });
  dot.ent = g.entities.add({ template: dotTpl, fill: 0.22 });

  // the man in black
  let dele = null, ride = null;
  const salonLight = { pos: [-44, land.heightAt(-44, -7) + 2.6, -6.5], radius: 17, color: [2.0, 0.55, 1.5], intensity: 0 };
  g.engine.lights.push(salonLight);
  const DELE_PATH = [[-12, 115], [-70, 113], [-180, 106], [-330, 84], [-520, -10], [-760, 40], [-1100, 40], [-1500, 80], [-800, 300], [-200, 220]];
  const OUT_PATH = [[-4, 116.5], [-80, 113], [-190, 105], [-330, 84], [-520, -10], [-760, 40], [-1100, 40], [-1500, 80], [-800, 300], [-200, 220]];

  dele = new Rider(gl, g.entities, DELE_PATH, { start: 0, coat: 0x141214, serape: [0x16141a, 0x5a1410, 0x16141a], look: { shirt: 0x16141a, bandana: 0x5a1410, hatCol: 0x0c0b0e }, speed: 0 });
  dele.e.hidden = true;
  g.engine.disturbers.push(dele.disturber);

  // ------------------------------------------------------------------ signs as things
  const camAtSign = (s) => {
    const f = s.faces[0];
    g.focus = { x: f.c[0], y: f.c[1] - 0.6, z: f.c[2], dist: 15, pitch: 0.1, yaw: Math.atan2(f.n[0], f.n[2]) };
  };
  async function prySign(gg, t) {
    const s = g.signs.get(t.sign);
    if (s.guarded && (await s.guarded())) return;
    const letters = g.signs.present(t.sign);
    if (!letters.length) { g.toast('Nothing left to take.'); return; }
    camAtSign(s);
    const key = await g.choose('', 'Pry which letter off ' + g.signs.reads(t.sign) + '?', [...letters.map((o) => ({ label: o.ch, key: String(o.i), bold: true })), { label: 'never mind', key: 'x' }]);
    if (key === 'x') return;
    const i = +key, ch = g.signs.pry(t.sign, i);
    if (!s.permit) { g.stand(-1); S().pried.push({ id: t.sign, i }); }
    await g.give(ch, g.signs.letterPos(t.sign, i));
    await signChanged(t.sign, 'pry', ch);
  }
  async function mendSign(gg, t) {
    const s = g.signs.get(t.sign), miss = g.signs.missing(t.sign);
    if (!miss.length) { g.toast('Nothing is missing here.'); return; }
    const fit = miss.find((m) => has(m.ch));
    if (!fit) { g.toast('You have no <b>' + [...new Set(miss.map((m) => m.ch))].join('</b> or <b>') + '</b> to hang.'); return; }
    if (s.confirm && !(await s.confirm(fit.ch))) return;
    camAtSign(s);
    g.lose(fit.ch, g.signs.letterPos(t.sign, fit.i));
    await g.pause(650);
    g.signs.mend(t.sign, fit.ch);
    s.glow = 1.4;
    good();
    const before = S().pried.length;
    S().pried = S().pried.filter((p) => !(p.id === t.sign && p.i === fit.i));
    if (S().pried.length < before) g.stand(1);
    await g.pause(500);
    await signChanged(t.sign, 'mend', fit.ch);
  }
  for (const s of g.signs.list) {
    if (!s.at) continue;
    const f = s.faces[0];
    g.addThing({
      id: 'sign:' + s.id, sign: s.id, x: s.at[0], z: s.at[1], r: 5.4,
      label: f.c[1] - land.heightAt(s.at[0], s.at[1]) + s.size * 0.6,
      tap: f.c,
      name: () => 'the sign: ' + g.signs.reads(s.id),
      listen: async () => {
        const reads = g.signs.reads(s.id), miss = g.signs.missing(s.id);
        const marked = miss.some((m) => s.caret[m.i]);
        camAtSign(s);
        await say('', 'It says ' + reads + '.' + (miss.length ? '\nIt used to say ' + s.text + '.' : '') + (marked ? '\nUnder the gap someone has scratched a small mark: ^' : ''));
        if (s.look) await s.look();
      },
      verbs: () => Object.assign({ PRY: prySign, MEND: mendSign }, s.verbs || {}),
    });
  }
  const sign = (id) => g.signs.get(id);
  const signThing = (id) => 'sign:' + id;

  // what a sign's new spelling does to the thing it names
  const OWNERS = { SALOON: marisol, LIVERY: odalys, SMITHY: bram, BARBER: ansel, [FEED]: fenn, SHERIFF: pike, 'DRY GOODS': hollis };
  const RETORT = {
    SALON: 'NOT AGAIN!', LIVER: 'That is disgusting. Put it back.', SMITH: 'Why.', SHERIF: 'One F short of authority. Hand it over.',
    'DRY GODS': 'The gods are parched. Put it back.', BARBE: 'Vandal!', 'FEED & RAIN': 'My oats!', 'FEED & GRAI': 'It was the last letter I had.',
  };
  async function signChanged(id, how, ch) {
    const reads = g.signs.reads(id), s = sign(id);
    if (id === 'WELL' && how === 'mend' && g.signs.whole('WELL')) {
      const [wx, wz] = SPOT.well, wy = land.heightAt(wx, wz);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * TAU;
        g.particles.emit(KIND.spray, wx + Math.cos(a) * 0.4, wy + 1.1, wz + Math.sin(a) * 0.4, Math.cos(a) * 1.6, 3 + Math.random() * 3.5, Math.sin(a) * 1.6, 0.9 + Math.random() * 0.8, 0.7);
      }
      await say('', 'The rope goes taut. Somewhere far down, a word finds its first letter, and the bucket comes up heavy.');
      if (S().ch === 4) {
        g.bark(bram, 'WATER!');
        g.stand(2);
        g.stage(5, 'Hung a W back on the WELL. The water came up.');
      }
      return;
    }
    if (id === 'SALOON' && how === 'mend' && g.signs.whole('SALOON')) {
      g.bark(marisol, 'HA!');
      if (S().ch === 6) g.stage(7, F().gaveOwnO ? 'Gave an O out of my own name to make the SALON a SALOON again.' : 'Hung the missing O back on the SALOON.');
      return;
    }
    if (id === FEED) {
      if (reads === 'FEED & RAIN') {
        g.flag('rained');
        await say('', 'The sign creaks. FEED & RAIN.\nA cloud the size of a barn roof remembers what it is for.');
      } else if (how === 'mend' && g.signs.whole(FEED) && F().rained && !F().fennPaid) {
        g.flag('fennPaid');
        await say(fenn, 'You brought it back. Nobody brings things back.');
        await say(fenn, 'Two dollars. Do not tell anyone I can afford it.');
        await g.give('$$', fenn);
        g.stand(1);
      }
      return;
    }
    if (how === 'pry' && !s.permit) {
      const owner = OWNERS[id];
      if (owner && RETORT[reads]) g.bark(owner, RETORT[reads]);
      else if (owner) g.bark(owner, 'HEY!');
      else if (reads === 'BAN') g.toast('Inside the BAN, a clerk quietly locks the door.');
      else g.toast('The sign reads <b>' + reads + '</b> now. Somebody will notice.');
      g.sfx && g.sfx('bad');
    }
  }

  // the depot sign is watched; the stones are not yours
  sign('SUNDOWN').guarded = async () => { await say(ezra, 'Not that one. Not ever.'); return true; };
  for (const id of ['WALT', 'WREN']) sign(id).guarded = async () => { await say(wren, 'You could. You will not.'); return true; };
  sign('WALT').confirm = async () => { await say(wren, 'No. I have said that goodbye once. Do not make me say it twice. The well.'); return false; };
  sign('SALOON').confirm = async (ch) => {
    if (ch !== 'O' || F().gotO || S().ch !== 6) return true;
    const a = await g.choose('', 'The only O you have is out of your own name. Hang it up there, and you are NOBDY.', ['NOD', 'NO']);
    if (a !== 'NOD') return false;
    g.flag('gaveOwnO');
    g.stand(2);
    return true;
  };
  sign('WELL').look = async () => {
    await say('', g.signs.whole('WELL') ? 'The bucket comes up full. It tastes of iron, and of something written.' : 'An ell is a measure of cloth. The bucket comes up dry.');
  };
  g.addThing({
    id: 'dressing', name: '', x: 0, z: 0, r: 0, label: 0,
    draw: (gg, text, time) => {
      if (g.signs.whole('WELL')) {
        const [wx, wz] = SPOT.well, wy = land.heightAt(wx, wz);
        for (let i = 0; i < 5; i++) {
          const a = time * 0.6 + i * 1.26, r = 0.25 + 0.3 * ((i * 37) % 10) / 10;
          text.planar('~', [wx + Math.cos(a) * r, wy + 0.98, wz + Math.sin(a) * r], [0, 1, 0], 0.34, [0.25, 0.55, 0.7], 0.25 + 0.2 * Math.sin(time * 3 + i));
        }
      }
      if (g.signs.reads('SALOON') === 'SALON') {
        const y0 = land.heightAt(-44, -8);
        for (let i = 0; i < 9; i++) {
          const u = (time * 0.22 + i / 9) % 1, x = -50 + ((i * 53) % 12), z = -8.2 + Math.sin(i * 2.1 + time) * 0.5;
          text.glyph(i % 3 ? '~' : '*', x + Math.sin(time * 0.9 + i) * 0.4, y0 + 0.8 + u * 4.2, z, 0.36, [0.9, 0.45, 0.8], { emis: 0.7 * (1 - u) });
        }
      }
    },
  });
  sign('WELL').verbs = {
    DO: async () => { await say('', g.signs.whole('WELL') ? 'You haul the rope. Cold water. You drink like a man with a name.' : 'You haul the rope. The bucket comes up full of nothing.'); },
  };

  // ------------------------------------------------------------------ asking (needs a ?)
  // topics: [{ q, run }]. Shown after an NPC's main line when you hold a question mark.
  async function ask(n, topics) {
    if (!has('?') || !topics.length) return;
    for (;;) {
      const open = topics.filter((t) => !t.once || !F()[t.once]);
      if (!open.length) return;
      const key = await g.choose(n, null, [...open.map((t, i) => ({ label: '? ' + t.q, key: String(topics.indexOf(t)) })), { label: 'leave it', key: 'x' }]);
      if (key === 'x') return;
      const t = topics[+key];
      if (t.once) g.flag(t.once);
      await t.run();
    }
  }
  const aboutLetters = (n, lines, key) => ({ q: 'the missing letters', once: key, run: async () => { for (const l of lines) await say(n, l); } });

  // ------------------------------------------------------------------ EZRA
  ezra.listen = async () => {
    if (S().ch === 0) {
      await say(ezra, 'First soul off the desert in a month, and on foot.');
      await say(ezra, 'Name, for the ledger?');
      await g.choose(ezra, null, []);
      await say(ezra, 'Nothing? Not so much as an initial?');
      await say(ezra, 'Then the ledger says NOBODY.');
      await g.give('NOBODY', ezra);
      await say(ezra, 'Six letters. Mind them. Out here a body is worth exactly what it can spell.');
      g.learn('NOD');
      g.learn('NO');
      const a = await g.choose(ezra, 'Try it. Are you looking for work?', ['NOD', 'NO']);
      if (a === 'NOD') await say(ezra, 'There. You said something. Odalys Vane keeps the LIVERY, west end of Main Street. She can always use hands.');
      else await say(ezra, 'A nobody who turns down work. Bold. When you get hungry: Odalys Vane, at the LIVERY, west end of Main Street.');
      await say(ezra, 'One more word, free of charge: DO. You have the letters for it, and most work answers to it.');
      g.learn('DO');
      await say(ezra, 'Mind the signs as you go. Letters have been going missing in this town.');
      g.stage(1, 'Came in off the desert with nothing. The stationmaster wrote me down as NOBODY.');
      return;
    }
    if (S().ch >= 11) { await say(ezra, 'The 5.40 sun is forty minutes late and not coming. Get our S back, Nobody.'); return; }
    await say(ezra, g.tc.count('O') < 2 ? 'NOBDY, is it, now. I will not correct the ledger. Ledgers remember.' : 'Still Nobody, I see. It suits you less every hour.');
    await ask(ezra, [
      aboutLetters(ezra, ['Three this month. Each time a little mark left underneath, like a proofreader had been by. ^', 'A caret. It means: something is missing here. As if we had not noticed.'], 'qEzra'),
      { q: 'the telegraph', once: 'qWire', run: async () => { await say(ezra, 'Dots and dashes. The smallest letters there are. When you have a few of your own, come back and I will show you how far a word can travel.'); } },
    ]);
  };
  ezra.verbs = { BOND: async () => { await say(ezra, 'Ezra shakes your hand exactly once, as if stamping a form.'); } };

  // ------------------------------------------------------------------ ODALYS
  odalys.listen = async () => {
    const c = S().ch;
    if (c <= 1) {
      await say(odalys, 'You the one Ezra wrote down as Nobody? Good. I need somebody, and you are close enough.');
      await say(odalys, 'Crows are into my oat sacks, out back by the corral. Through the gap past my east wall.');
      const a = await g.choose(odalys, 'Can you DO something about them?', ['DO', 'NOD', 'NO']);
      if (a === 'NO') { await say(odalys, 'Then stand there and be decorative. The oats will keep until you change your mind.'); return; }
      await say(odalys, 'They quit scaring for me years ago. Maybe a stranger still has a BOO in him. B, O, O. You have got those.');
      g.learn('BOO');
      g.stage(2, 'Odalys Vane at the livery has crows in her oats.');
    } else if (c === 2) {
      await say(odalys, 'Out back. Through the gap. They are eating my profit.');
    } else if (c === 3) {
      await say(odalys, 'Gone? All of them? Ha!');
      await say(odalys, 'Here. An R off an old rein, and a dollar for the hour.');
      await g.give('R$', odalys);
      await say(odalys, 'R is a working letter. You will find it gets into everything.');
      await say(odalys, 'Go and wash the dust off at the well, middle of the street.');
      await say(odalys, 'Oh. No. You cannot. Go and look at it. You will see.');
      g.stage(4, 'Ran the crows off. Earned an R and a dollar.');
    } else if (c === 4) {
      await say(odalys, 'An ELL. Three days now. Bram at the SMITHY knows about putting things back. Start there.');
    } else if (c === 5) {
      await say(odalys, 'I heard the bucket from here. First water in three days.');
      await say(odalys, 'Take an A. And Ezra left this for you. He says anyone who puts a letter back has earned the right to ask where the rest went.');
      await g.give('A?$', odalys);
      await say(odalys, 'That hook is a question mark. Keep hold of it, and people will have to answer you.');
      await say(odalys, 'Speaking of. Marisol has been hollering since sunup. Go and see what is wrong at the SALOON. If you can find it.');
      g.stage(6, 'Paid an A, a dollar, and a question mark. I can ask things now.');
    } else if (c === 6 || c === 7) {
      await say(odalys, 'The saloon is two doors east of the smith. Follow the shouting.');
    } else if (c === 8) {
      await say(odalys, 'It is in the hay! Buckets will not do it! It needs RAIN, and I am fresh out!');
    } else if (c === 9) {
      await say(odalys, 'You made it rain. With a pry bar.');
      await say(odalys, 'I have been calling you Nobody all day. I am not going to stop. But I thought about it.');
      await g.give('I', odalys);
      await say(odalys, 'An I. The smallest word there is, and the hardest to mean.');
      await say(odalys, 'And when you can spell RIDE, old Dot is yours to borrow. R, I, D, E.');
      g.learn('RIDE');
      g.stage(10, 'Odalys gave me an I, and the loan of a mare called Dot.');
      await sheriffComes();
    } else if (c === 10) {
      await say(odalys, 'Go! The depot!');
    } else {
      await say(odalys, 'She is the grey one. Smallest thing in the alphabet, a dot, and she will outlast all of it. Bring her back.');
    }
    if (c >= 4 && c <= 7) {
      await ask(odalys, [
        aboutLetters(odalys, ['First it was a comma off the bank. Nobody missed it. Then the W.', 'You do not think about letters until one is gone. Then it is all you can read.'], 'qOdalys'),
        { q: 'Dot', once: 'qDot', run: async () => { await say(odalys, 'Grey mare in the corral. Twenty two years old and still thinks she is a full stop.'); } },
      ]);
    }
  };
  odalys.verbs = { BOND: async () => { await say(odalys, 'Odalys looks you over, hat to boots. "You are no trouble. That is rarer than it sounds."'); if (!F().bondOdalys) { g.flag('bondOdalys'); g.stand(1); } } };

  // the crows
  const crows = [];
  for (let i = 0; i < 8; i++) crows.push({ a: Math.random() * TAU, d: 0.4 + Math.random() * 2.6, hop: Math.random() * 3, fly: 0, vx: 0, vz: 0, h: 0 });
  g.addThing({
    id: 'crows', name: 'crows, in the oats', x: SPOT.sacks[0] + 0.4, z: SPOT.sacks[1] + 0.4, r: 7.5, label: 1.6,
    show: () => S().ch === 2 || crows.some((c) => c.fly > 0 && c.fly < 6),
    listen: async () => { await say('', 'Eight crows, elbow deep in oats. They look at you the way a banker looks at a nobody.'); },
    verbs: () => (S().ch === 2 ? {
      BOO: async () => {
        g.bark(g.player, 'BOO!', [1, 0.9, 0.7], 1.0, 1.6);
        await g.pause(350);
        for (const c of crows) { c.fly = 0.001 + Math.random() * 0.3; const a = Math.random() * TAU; c.vx = Math.cos(a) * (4 + Math.random() * 4); c.vz = Math.sin(a) * (4 + Math.random() * 4); }
        g.bark({ x: SPOT.sacks[0], z: SPOT.sacks[1], label: 2.5 }, 'CAW! CAW!', [0.7, 0.72, 0.85], 0.7);
        await g.pause(1500);
        await say('', 'The crows go up like a torn page. The oats are yours to guard, or at least nobody else\'s.');
        g.stage(3, 'Said BOO to eight crows. It worked.');
      },
      DO: async () => { await say('', 'You wave your arms. The crows regard this as theatre.'); },
      BOND: async () => { await say('', 'One crow hops close, sets a bottle cap at your feet, and goes back to the oats. You have made a friend. The oats are still being eaten.'); },
    } : {}),
    draw: (gg, text, time) => {
      for (const c of crows) {
        if (S().ch !== 2 && c.fly === 0) continue;
        let x = SPOT.sacks[0] + 0.4 + Math.cos(c.a) * c.d, z = SPOT.sacks[1] + 0.4 + Math.sin(c.a) * c.d, y = land.heightAt(x, z) + 0.34;
        let ch = 'v';
        if (c.fly > 0) {
          if (c.fly > 6) continue;
          x += c.vx * c.fly; z += c.vz * c.fly; y += 1.2 + c.fly * 3.2 + Math.sin(c.fly * 3) * 0.5;
          ch = Math.floor(time * 9 + c.a * 3) % 2 ? 'v' : '^';
        } else {
          const hp = (time + c.hop) % 3;
          y += hp < 0.25 ? Math.sin((hp / 0.25) * Math.PI) * 0.25 : 0;
          ch = Math.floor((time + c.hop) * 1.3) % 3 === 0 ? 'y' : 'v';
        }
        text.glyph(ch, x, y, z, 0.62, [0.2, 0.2, 0.28], { card: true, lit: true });
      }
    },
  });

  // ------------------------------------------------------------------ BRAM
  async function bellows() {
    await say(bram, 'Long strokes. Do not stop when it gets hot. That is when it is working.');
    g.player.gesture = 'work';
    g.focus = { x: bram.x + 1, y: land.heightAt(bram.x, bram.z) + 1.3, z: bram.z, dist: 9, pitch: 0.25, yaw: g.engine.cam.yaw };
    for (let i = 0; i < 26; i++) g.particles.emit(KIND.spark, SPOT.anvil[0], land.heightAt(...SPOT.anvil) + 1.0, SPOT.anvil[1], (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.5 + Math.random() * 0.6, 1);
    await g.lapse(Math.min(S().hour + 0.5, 11.5), 2.6);
    g.player.gesture = null;
    await say(bram, 'Good. You lean into it.');
    await g.give('ME', bram);
    g.flag('gotME');
    await say(bram, 'The W, I cannot make. W is a difficult letter. Only two people in this town had one to spare, and one of them is dead.');
    await say(bram, 'Ask the Widow Wren. Boot Hill, north west, past the church. Go gently.');
  }
  bram.listen = async () => {
    const c = S().ch;
    if (c < 4) { await say(bram, 'Bram Ashdown. Iron, shoes, hinges. If it is not on fire I am not interested.'); return; }
    if (c === 4 && !F().gotME) {
      await say(bram, 'You have seen the well. An ELL. Forty five inches of nothing. A man cannot drink a measurement.');
      await say(bram, 'To put a letter back you need the letter, and you need the word. MEND. M, E, N, D.');
      g.learn('MEND');
      const a = await g.choose(bram, 'You carry the N and the D. Work my bellows a while and I will strike you an M and an E.', ['DO', 'NOD', 'NO']);
      if (a === 'NO') { await say(bram, 'Then stay thirsty.'); return; }
      await bellows();
    } else if (c === 4) {
      await say(bram, F().gotW ? 'You have the letter and the word. Go and MEND it.' : 'Widow Wren. Boot Hill. Go gently.');
    } else if (c === 8) {
      await say(bram, 'Sand! Wet sacks! Anything!');
    } else {
      await say(bram, 'Water is back. Good work, Nobody.');
      await ask(bram, [aboutLetters(bram, ['A letter is iron. Somebody made it. So somebody can unmake it.', 'I would like to meet the man with a forge that hot. Briefly.'], 'qBram')]);
    }
  };
  bram.verbs = () => Object.assign({ BOND: async () => { await say('', 'Bram nods back. That is the whole conversation, and a good one.'); } },
    S().ch === 4 && !F().gotME && S().known.includes('MEND') ? { DO: bellows } : {});

  // ------------------------------------------------------------------ WIDOW WREN and the hat
  wren.listen = async () => {
    const c = S().ch;
    if (c < 4) { await say(wren, 'Mind the stones, please. They are all the conversation I get.'); return; }
    if (c === 4 && !F().gotW) {
      await say(wren, 'You are the one they are calling Nobody.');
      const a = await g.choose(wren, 'Sit a minute, if you have one. Nobody does, anymore.', ['NOD', 'BOND', 'NO']);
      if (a === 'NO') { await say(wren, 'No. Well. Honest, at least. Come back when you have a minute.'); return; }
      if (a === 'BOND') { g.learn('BOND'); g.stand(1); }
      g.player.gesture = 'sit';
      await say(wren, 'Walt dug that well. Forty feet through caliche with a short shovel and a long temper.');
      await say(wren, 'When the W went missing I thought: there he goes again. Second time I have lost him.');
      await say(wren, 'His stone has one. I have polished it every Sunday for four years.');
      await say(wren, '...Take it. A well is a better place for a man than a stone.');
      g.player.gesture = null;
      g.signs.pry('WALT', 0, false);
      await g.give('W', g.signs.letterPos('WALT', 0));
      g.flag('gotW');
      g.stand(1);
      await say(wren, 'And take his hat down off that nail. He would hate to see a head go bare in this sun.');
      g.flag('hatOffered');
      if (!S().known.includes('MEND')) await say(wren, 'You will want Bram Ashdown to teach you the word for putting it back. I only know the one for letting go.');
      g.save();
      return;
    }
    if (c === 4) { await say(wren, 'Go on. He is waiting to be useful.'); return; }
    await say(wren, g.signs.whole('WELL') ? 'I heard the bucket. He is in the water now. That is better than in the ground.' : 'Mind the stones.');
    await ask(wren, [aboutLetters(wren, ['When you lose a letter you do not lose a sound. You lose everything it was holding up.', 'Ask an ALT about his wife sometime.'], 'qWren')]);
  };
  wren.verbs = { BOND: async () => { await say('', 'You stand with her a while and read nothing. It is the right amount to say.'); if (!F().bondWren) { g.flag('bondWren'); g.stand(1); } } };
  g.addThing({
    id: 'hat', name: "Walt's hat, on a nail", x: SPOT.grave[0] - 1.6, z: SPOT.grave[1] + 0.6, r: 2.6, label: 1.5,
    show: () => F().hatOffered && !S().hat,
    listen: async () => { await say('', 'A sweat-stained hat with a good brim. Four years of sun have not hurt it.'); g.learn('DON'); },
    verbs: { DON: async () => { g.setHat(true); good(); await say('', 'You DON the hat. It fits like it had been waiting.'); g.S.log.push("Wearing a dead man's hat. It helps."); } },
    draw: (gg, text) => { const y = land.heightAt(SPOT.grave[0] - 1.6, SPOT.grave[1] + 0.6); text.line('_n_', SPOT.grave[0] - 1.6, y + 1.2, SPOT.grave[1] + 0.6, 0.5, [0.5, 0.38, 0.26], { lit: true }); text.glyph('|', SPOT.grave[0] - 1.6, y + 0.55, SPOT.grave[1] + 0.6, 1.0, [0.3, 0.24, 0.18], { lit: true }); },
  });

  // ------------------------------------------------------------------ MARISOL, ANSEL and the SALON
  marisol.listen = async () => {
    const c = S().ch;
    if (c < 6) { await say(marisol, 'Marisol Crane. If you are not buying, you are furniture.'); return; }
    if (c === 6) {
      if (!F().metMari) {
        await say(marisol, 'Look at it. LOOK at it. SALON.');
        await say(marisol, 'I woke to lace curtains, and a man asking could I do something about his sideburns.');
        await say(marisol, 'My whiskey has turned to lavender water. Find my other O, Nobody.');
        g.flag('metMari');
      } else {
        await say(marisol, 'Still a SALON. I have had three requests for a pomade.');
      }
      if (g.tc.count('O') >= 2 && !F().gotO) await say(marisol, 'You are carrying two of your own, I notice. I would not ask. But I notice.');
      await ask(marisol, [
        { q: 'who would do it', once: 'clueAnsel', run: async () => {
          await say(marisol, 'No scratch under mine. The well had that little mark, did it not? Mine is clean. A different hand.');
          await say(marisol, 'And Ansel Trim across the street has had a full chair since sunup. Has he not.');
        } },
        { q: 'last night', once: 'qNight', run: async () => { await say(marisol, 'I heard a ladder. I thought: drunk on a roof. It is usually a drunk on a roof.'); } },
      ]);
      return;
    }
    if (c === 7) {
      if (F().gaveOwnO) {
        await say(marisol, 'That one is yours. Out of your own name.');
        await say(marisol, 'Nobody has ever... Ha. Well. Nobody has, now.');
      } else {
        await say(marisol, 'There is my second O. Hear that? That is a piano going back out of tune.');
      }
      await say(marisol, 'Somebody took a pry bar to that sign. P, R, Y. Here is a P, so you know one when you see it.');
      if (!F().paidP) { g.flag('paidP'); await g.give(F().gaveOwnO ? 'P$$' : 'P$', marisol); }
      g.learn('PRY');
      if (F().anselTold) await say(marisol, 'And Ansel can whistle for my custom. Thank you for the name.');
      S().log.push('Marisol paid me a P. I know the word PRY now.');
      await afternoon();
      return;
    }
    await say(marisol, c === 8 ? 'Do not look at me, I pour whiskey, not water!' : 'First one is on the house, when this day is over. If it is ever over.');
  };
  marisol.verbs = { BOND: async () => { await say(marisol, '"You do not talk much. In my trade that is the best customer there is."'); if (!F().bondMari) { g.flag('bondMari'); g.stand(1); } } };

  ansel.listen = async () => {
    const c = S().ch;
    const guilty = c >= 6 && !F().gotO;
    if (!guilty) {
      await say(ansel, F().anselTold ? 'I hope you are pleased with yourself.' : F().anselQuiet ? 'Not a word, friend. Not a word.' : 'Ansel Trim. Tonsorial arts. You could use them, if you do not mind my saying.');
      return;
    }
    await say(ansel, 'Lovely morning for the grooming trades. Lovely.');
    if (!has('?')) { await say('', 'He will not meet your eye. If only you had a way to ask him something.'); return; }
    const k = await g.choose(ansel, null, [{ label: '? the missing O', key: 'o' }, { label: 'leave it', key: 'x' }]);
    if (k === 'x') return;
    await say(ansel, 'An O? What would a barber want with an O? There are several in POMADE. One. There is one.');
    const a = await g.choose(ansel, 'He straightens a comb that was already straight.', ['NO', 'NOD']);
    if (a === 'NOD') { await say(ansel, 'Just so. Good day.'); return; }
    await say(ansel, 'All right! It was on the ground! It had fallen. I merely declined to pick it up in her direction.');
    const b = await g.choose(ansel, 'Here. Take it. But nobody needs to know. NOD, and there is a T in it for you. T for Trim.', ['NOD', 'NO']);
    g.flag('gotO');
    if (b === 'NOD') { await g.give('OT', ansel); g.flag('anselQuiet'); }
    else { await say(ansel, 'Then take it and tell her. See if I care. I care a great deal.'); await g.give('O', ansel); g.flag('anselTold'); g.stand(1); }
    S().log.push(b === 'NOD' ? 'The barber had the O. I took a T to keep quiet.' : 'The barber had the O. I mean to say so.');
  };

  // the tip jar: three dollars and a test of character
  g.addThing({
    id: 'jar', name: 'a tip jar', x: -39.6, z: -8.1, r: 2.4, label: 1.2,
    show: () => !F().robbed,
    listen: async () => { await say('', 'A jar on the porch rail. Three dollars in it, and nobody watching. Marisol is watching.'); },
    verbs: { ROB: async () => {
      await g.give('$$$', { x: -39.6, z: -8.1, label: 1.0 });
      g.flag('robbed');
      g.stand(-2);
      g.bark(marisol, 'I SAW THAT.');
      g.sfx && g.sfx('bad');
      S().log.push('Took three dollars out of a tip jar. Everyone will know by supper.');
    } },
    draw: (gg, text) => { const y = land.heightAt(-39.6, -8.1); text.line('[$$$]', -39.6, y + 1.15, -8.1, 0.36, [0.85, 0.75, 0.4], { lit: true }); },
  });

  // ------------------------------------------------------------------ FENN, the fire and the rain
  const fire = { pos: [SPOT.hay[0] + 0.7, 0, SPOT.hay[1] + 0.4], size: 0, on: false };
  fire.pos[1] = land.heightAt(fire.pos[0], fire.pos[2]) + 0.5;
  const fireLight = { pos: [fire.pos[0], fire.pos[1] + 1.6, fire.pos[2]], radius: 34, color: [2.8, 1.2, 0.35], intensity: 0, flicker: 0.45, seed: 4 };
  g.engine.lights.push(fireLight);
  g.addThing({
    id: 'fire', name: 'the hay, burning', x: SPOT.hay[0] + 0.7, z: SPOT.hay[1] + 3.4, r: 6, label: 3.2,
    show: () => fire.on,
    listen: async () => { await say('', 'The hay is going up like a bad idea. The heat pushes you back a step.'); },
    verbs: { DO: async () => { await say('', 'You beat at it with your hands. It is not that kind of fire.'); }, BOO: async () => { await say('', 'The fire is not impressed.'); } },
  });
  async function afternoon() {
    await say('', 'The day leans west. Shadows come out from under things.');
    g.hourCap = 17.2;
    await g.lapse(16.75, 4.5);
    g.stage(8, null);
    g.bark(odalys, 'FIRE!', [1, 0.5, 0.15], 1.4, 3.5);
    g.sfx && g.sfx('bell');
    g.focus = { x: fire.pos[0], y: fire.pos[1] + 1.5, z: fire.pos[2], dist: 30, pitch: 0.3, yaw: 0.45 };
    await g.pause(2600);
    await say('', 'Smoke, from behind the livery. Bram\'s forge has thrown a spark into the hay.');
  }
  fenn.listen = async () => {
    const c = S().ch;
    if (c < 8) { await say(fenn, 'Tobias Fenn. Feed and grain. Mostly grain. Prices are up, before you ask, and so is everything else.'); return; }
    if (c === 8) {
      await say(fenn, 'Oh no. Oh no no. If that jumps the street my GRAIN goes with it.');
      await say(fenn, 'My GRAIN. G, R, A, I, N.');
      camAtSign(sign(FEED));
      await say(fenn, 'Funny word, grain. Take one letter off the front of it, and...');
      await say(fenn, 'Take it. Take the G! Wet oats beat burnt ones!');
      sign(FEED).permit = true;
      g.flag('fennPermit');
      g.learn('PRY');
      return;
    }
    if (!g.signs.whole(FEED)) { await say(fenn, 'It is still raining on my oats. About my G.'); return; }
    await say(fenn, 'You are honest, for a nobody. I shall have to raise my opinion of the entire category.');
  };
  fenn.verbs = { BOND: async () => { await say(fenn, '"Nobody ever asks how the feed man is. He is tired. Thank you."'); if (!F().bondFenn) { g.flag('bondFenn'); g.stand(1); } } };

  // ------------------------------------------------------------------ PIKE, the poster, the store
  async function sheriffComes() {
    const p = g.player;
    pike.x = p.x + 16; pike.z = p.z + 9;
    await new Promise((res) => { pike.path = { x: p.x + 1.8, z: p.z + 1.2, speed: 7, done: res }; if (g.ui.auto) { pike.x = p.x + 1.8; pike.z = p.z + 1.2; pike.path = null; res(); } });
    await say(pike, 'Nobody. Somebody is at the depot sign. Right now.');
    await say(pike, 'Come on.');
    pike.path = { x: 0, z: 3, speed: 7.5, done: () => { pike.path = { x: -1, z: 111.5, speed: 7.5, done: null }; } };
  }
  pike.listen = async () => {
    const c = S().ch;
    if (c === 10) { await say(pike, 'Depot. Move.'); return; }
    if (c >= 11) { await say(pike, 'He has the S. You have the hands. Dot is saddled.'); return; }
    await say(pike, S().standing <= -2 ? 'I have my eye on you, Nobody. Signs in this town stay spelled.' : 'Sheriff Pike. You are new. Keep your hands off the signs and we will get on fine.');
    await ask(pike, [
      aboutLetters(pike, ['Three this month. The bank lost a comma nobody noticed. Then the W. Always the little mark underneath.', 'There is a name for him on that paper by my door. If you can READ.'], 'qPike'),
    ]);
    g.learn('READ');
  };
  g.addThing({
    id: 'poster', name: 'a paper nailed to the wall', x: 14.7, z: -8.7, r: 2.8, label: 1.8,
    listen: async () => { await say('', 'Printed marks, in rows. They swim. You never did learn.'); },
    verbs: { READ: async () => {
      await say('', 'WANTED: DELE.\nFor the unmaking of words.');
      await say('', 'Leaves a ^ where a letter was.\nDo not speak to him. He will take the words out of your mouth.');
      if (!F().readPoster) { g.flag('readPoster'); S().log.push('Read the paper by the sheriff\'s door. The thief has a name: DELE.'); }
    } },
    draw: (gg, text) => {
      const y = land.heightAt(14.2, -10.9);
      'WANTED'.split('').forEach((ch, i) => text.planar(ch, [14.28 + i * 0.165, y + 2.25, -10.92], [0, 0, 1], 0.27, [0.9, 0.86, 0.74], 0.05));
      'DELE'.split('').forEach((ch, i) => text.planar(ch, [14.33 + i * 0.25, y + 1.86, -10.92], [0, 0, 1], 0.42, [0.95, 0.5, 0.3], 0.1));
    },
  });
  const STOCK = ['U', 'L', 'K', 'T', 'H'];
  hollis.listen = async () => {
    await say(hollis, 'Hollis Reed. Dry goods. Letters by the each, two dollars, no credit, no exceptions, no nobodies. Well. One nobody.');
    for (;;) {
      const left = STOCK.filter((ch) => !F()['bought' + ch]);
      if (!left.length) { await say(hollis, 'You have cleaned me out of consonants.'); return; }
      const k = await g.choose(hollis, 'You have $' + g.tc.money + '.', [...left.map((ch) => ({ label: ch, key: ch, bold: true, note: '$2', ok: g.tc.money >= 2, lack: '$2' })), { label: 'S', key: 'S', bold: true, note: 'sold' }, { label: 'nothing today', key: 'x' }]);
      if (k === 'x') return;
      if (k === 'S') { await say(hollis, 'An S? Sold my last one at sunup. Tall fellow, all in black. Paid in commas.'); await say(hollis, 'I did think it was odd. But a comma is a comma.'); continue; }
      g.tc.remove('$'); g.tc.remove('$');
      g.flag('bought' + k);
      await g.give(k, hollis);
      if (k === 'U' && g.tc.can('RUN')) { g.learn('RUN'); await say(hollis, 'R, U, N. Mind you do not, in my store.'); }
    }
  };

  // ------------------------------------------------------------------ small mercies
  g.addThing({
    id: 'church', name: 'the church door', x: PLACES.church[0] + 6.6, z: PLACES.church[1] + 6.0, r: 4.5, label: 2.4,
    listen: async () => { await say('', 'The door is open. Inside it is cool, and smells of candle and old hymnals.'); },
    verbs: { PRAY: async () => {
      if (F().prayed) { await say('', 'You ask for nothing in particular, again. It is a comfort all the same.'); return; }
      g.flag('prayed');
      await say('', 'You ask for nothing in particular.');
      await g.give('+', { x: PLACES.church[0], z: PLACES.church[1], label: 12 });
      await say('', 'A small cross drops into your case. A plus. It means: and one more.');
    } },
  });
  g.addThing({
    id: 'dig', name: () => (F().dug ? 'a tin box, in a hole' : 'a mark scratched in the dirt'), x: SPOT.dig[0], z: SPOT.dig[1], r: 2.6, label: 0.8,
    show: () => !F().boxOpen,
    listen: async () => { await say('', F().dug ? 'A tin box, shut tight. If only you could spell the opposite.' : 'Someone scratched an x here, a long time ago, and went away meaning to come back.'); g.learn(F().dug ? 'OPEN' : 'DIG'); },
    verbs: () => (F().dug ? { OPEN: async () => {
      g.flag('boxOpen');
      await say('', 'Inside: three dollars, and a K wrapped in oilcloth. Somebody was saving it for a word.');
      await g.give('$$$K', { x: SPOT.dig[0], z: SPOT.dig[1], label: 0.3 });
    } } : { DIG: async () => { g.flag('dug'); g.player.gesture = 'work'; await g.pause(1200); g.player.gesture = null; await say('', 'Two feet down, your hands find tin.'); } }),
    draw: (gg, text) => { text.planar('x', [SPOT.dig[0], land.heightAt(...SPOT.dig) + 0.07, SPOT.dig[1]], [0, 1, 0], 1.1, [0.75, 0.5, 0.3], 0.05); },
  });

  // ------------------------------------------------------------------ DOT and the road out
  dot.listen = async () => { await say('', S().ch >= 11 ? 'Dot is saddled, and looking west, where the sun is not going down.' : 'A grey mare, old as the town. She regards you with one eye and files you under: later.'); };
  dot.verbs = {
    BOND: async () => { await say('', 'Dot leans her whole head on you. It weighs about as much as a decision.'); if (!F().bondDot) { g.flag('bondDot'); g.stand(1); } },
    BOO: async () => { await say('', 'Dot has heard worse from better.'); },
    RIDE: async () => {
      if (S().ch < 11) { await say('', 'Dot does not move. She is not yours to borrow. Not yet.'); return; }
      if (S().ch >= 12) { await say('', 'Dot has done her riding for today. The road west will keep until chapter two.'); return; }
      await rideOut();
    },
  };

  async function undown() {
    const sgn = sign('SUNDOWN'), f = sgn.faces[0];
    dele.e.hidden = false;
    dele.u = 0; dele.speed = 0;
    dele.update(0, g.engine, null);
    g.focus = { x: f.c[0], y: f.c[1] - 1.2, z: f.c[2] + 3, dist: 21, pitch: 0.12, yaw: 0.25 };
    ezra.x = -15; ezra.z = 113.5;
    await g.pause(1800);
    await say('', 'A man in black sits his horse under the depot sign, reading it the way you would read a menu.');
    g.bark({ x: dele.pos[0], z: dele.pos[2], label: 3.0 }, 'SUNDOWN.', [0.9, 0.3, 0.2], 0.8, 1.8);
    await g.pause(2100);
    g.signs.pry('SUNDOWN', 0, true);
    g.floaters.push({ ch: 'S', x: f.c[0] - 3 * sgn.adv, y: f.c[1], z: f.c[2], to: [dele.pos[0], dele.pos[1] + 2.4, dele.pos[2]], t: 0, life: 1.1, size: 1.1, col: [1, 0.4, 0.2], arc: 1.5 });
    g.sfx && g.sfx('bad');
    await g.pause(1500);
    g.bark({ x: dele.pos[0], z: dele.pos[2], label: 3.0 }, 'UNDOWN.', [0.9, 0.3, 0.2], 0.8, 2.0);
    await g.pause(1500);
    dele.speed = 14;
    g.hourCap = 17.86;
    const lapse = g.lapse(17.86, 5);
    const t0 = performance.now();
    while (performance.now() - t0 < 5000 && !g.ui.auto) {
      g.focus = { x: dele.pos[0], y: dele.pos[1] + 1.5, z: dele.pos[2], dist: 26, pitch: 0.1, yaw: 1.45 };
      await g.pause(30);
    }
    await lapse;
    g.focus = { x: -60, y: land.heightAt(-60, 112) + 3, z: 112, dist: 60, pitch: 0.06, yaw: 1.5 };
    await say('', 'The sun touched the mesas, and stopped.');
    await say(pike, 'He took the S. This town is called UNDOWN now.');
    await say(ezra, 'The 5.40 sun ought to be gone by this time. It is not going, is it.');
    await say(pike, 'A day that cannot end. Crops will cook. Nobody will sleep.');
    await say(pike, '...Nobody.');
    await say(pike, 'You have put back more letters since breakfast than I have in a year. Odalys has Dot saddled. Go and get our S.');
    g.cam.yaw = 1.35; g.cam.pitch = 0.2; g.cam.dist = 19;
    g.stage(11, 'A man in black took the S off SUNDOWN. The sun will not set on a town called UNDOWN.');
  }

  async function rideOut() {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    await g.pause(700);
    const p = g.player;
    ride = new Rider(gl, g.entities, OUT_PATH, { start: 0, coat: 0x9a8f80, serape: null, look: { hat: S().hat, shirt: 0xcfc4a8, bandana: 0xb8322a, hatCol: 0x5a4632 }, speed: 12.5 });
    p.ent.hidden = true;
    dot.ent.hidden = true;
    g.flag('rode');
    g.cut = { rider: ride, t: 0 };
    fade.classList.remove('on');
    await g.pause(9500);
    fade.classList.add('on');
    await g.pause(800);
    g.cut = null;
    ride.e.hidden = true;
    p.ent.hidden = false;
    p.x = 0; p.z = 108; p.yaw = WEST;
    const st = S().standing;
    const verdict = st >= 5 ? 'The town says: Nobody is all right.' : st >= 1 ? 'The town says: Nobody is useful.' : 'The town says: count your letters when Nobody has been by.';
    g.stage(12, 'Rode west after the man in black, into a sun that would not set.');
    fade.classList.remove('on');
    good();
    const pick = await g.ui.card({
      kick: 'End of chapter one',
      title: 'NOBODY',
      lines: 'You came with no letters and leave with ' + g.tc.items.filter((c) => /[A-Z]/.test(c)).length + '.\nYou know ' + S().known.length + ' words.\n' + verdict + '\n\nChapter two, THE LONG DAY, is not yet written.',
      buttons: ['WANDER SUNDOWN', 'TITLE'],
    });
    if (pick === 1) g.onQuit && g.onQuit();
  }

  // words that work anywhere
  const words = {
    NOD: async () => { g.toast('You nod at nobody in particular.'); },
    NO: async () => { g.toast('You refuse. Nothing had been offered.'); },
    DO: async () => { g.toast('There is nothing here that wants doing.'); },
    BOO: async (gg, t) => { if (t && t.npc) await say(t, ['"Mm."', '"Was that meant for me?"', '"Bless you."'][t.seed % 3]); else g.toast('BOO. The street does not flinch.'); },
    BOND: async (gg, t) => { if (t && t.npc) await say('', t.name + ' takes your hand. It costs nothing and is worth about that, which is to say: a great deal.'); else g.toast('There is nobody here to bond with.'); },
    MEND: async () => { g.toast('Nothing here is missing a letter.'); },
    PRY: async () => { g.toast('Stand under a sign to pry at it.'); },
    DIG: async () => { g.toast('The ground here keeps its secrets.'); },
    READ: async () => { g.toast('There is nothing to read but the land.'); },
    OPEN: async () => { g.toast('Everything here is already open: it is a desert.'); },
    RIDE: async () => { g.toast('You would need a horse.'); },
    ROB: async (gg, t) => { if (t && t.npc) { await say(t, '"Try that again when you are somebody."'); g.stand(-1); } else g.toast('There is nothing here worth the shame.'); },
    RUN: async () => { g.toast('While you can spell RUN, you move faster.'); },
    PRAY: async () => { g.toast('Not here. Somewhere with a door, and a quiet.'); },
    NAME: async () => { g.toast('Not yet. A name has to be given or taken, and you have done neither.'); },
    BODY: async () => { g.toast('A grim thing to say out loud.'); },
    BOY: async () => { g.toast('Every dog in town looks up.'); },
    NAP: async () => {
      if (S().hour >= g.hourCap - 0.05) { g.toast('The day will not let you sleep through this.'); return; }
      await say('', 'You find a patch of shade and let an hour or two go by without you.');
      await g.lapse(Math.min(g.hourCap, S().hour + 1.5), 3.5);
    },
    NOBODY: async () => { g.toast('That is you. For now.'); },
    MONEY: async () => { g.toast('Saying it does not make it so. It never has.'); },
    DEMON: async () => { g.toast('Do not.'); },
    DOOR: async () => { g.toast('You knock on the air. Nobody is home.'); },
    PONY: async (gg, t) => { if (t === dot) await say('', 'Dot turns her head slowly and looks at you until you take it back.'); else g.toast('Somewhere, a grey mare flattens her ears.'); },
    AMEN: async () => { g.toast('Amen. Short, and enough.'); },
    POEM: async () => {
      await say('', 'You clear your throat.\n\n"A body needs but little: bread,\na road, a name, a place to bed."');
      await say('', 'It is not much of a poem. It is the most you have ever said.');
    },
    BOOM: async () => {
      g.bark(g.player, 'BOOM', [1, 0.95, 0.8], 1.4, 1.6);
      g.engine.atmo.flashPos = [g.player.x, g.player.y + 60, g.player.z];
      g.engine.atmo.flash = 1.5;
      g.sfx && g.sfx('bad');
      await g.pause(700);
      for (const id in g.npcs) { const n = g.npcs[id]; if (Math.hypot(n.x - g.player.x, n.z - g.player.z) < 40) g.bark(n, ['!', '?!', 'HEY'][n.seed % 3], [0.8, 0.75, 0.65], 0.6, 1.5); }
      g.toast('The sky repeats it, once, to be polite.');
    },
    YODEL: async () => {
      g.bark(g.player, 'YODEL-AY-EE-OO', [1, 0.9, 0.6], 0.8, 3);
      await g.pause(1400);
      g.bark({ x: g.player.x - 30, z: g.player.z - 10, label: 8 }, '...ay-ee-oo', [0.6, 0.55, 0.45], 0.7, 3);
      await g.pause(900);
      g.toast('Nobody asked. The mesas answer anyway.');
    },
  };

  // ------------------------------------------------------------------ the chapter
  function objective() {
    const c = S().ch, f = F();
    const at = (t) => [t.x, t.z];
    const st = (id) => { const t = g.thing(signThing(id)); return [t.x, t.z]; };
    switch (c) {
      case 0: return { text: 'Speak to the stationmaster.', at: at(ezra), thing: 'ezra' };
      case 1: return { text: 'Find Odalys Vane at the LIVERY, at the west end of Main Street.', at: at(odalys), thing: 'odalys' };
      case 2: return { text: 'Scare the crows off the oat sacks behind the livery.', at: [SPOT.sacks[0], SPOT.sacks[1]], thing: 'crows' };
      case 3: return { text: 'Tell Odalys the crows are gone.', at: at(odalys), thing: 'odalys' };
      case 4:
        if (!S().known.includes('MEND') && !f.gotW) return { text: 'The WELL has lost its W: it is an ELL, and dry. Go and look, then ask the smith about mending.', at: at(bram), thing: 'bram' };
        if (!f.gotME) return { text: 'Earn the letters for MEND from Bram, the smith.', at: at(bram), thing: 'bram' };
        if (!f.gotW) return { text: 'Ask the Widow Wren on Boot Hill for a W.', at: at(wren), thing: 'wren' };
        return { text: 'Hang the W back on the WELL. Stand by it and MEND.', at: st('WELL'), thing: signThing('WELL') };
      case 5: return { text: 'Tell Odalys the well runs.', at: at(odalys), thing: 'odalys' };
      case 6:
        if (!f.metMari) return { text: 'See what is wrong at the SALOON.', at: at(marisol), thing: 'marisol' };
        if (f.gotO) return { text: 'Hang the O back on the SALOON. Stand under the sign and MEND.', at: st('SALOON'), thing: signThing('SALOON') };
        if (f.clueAnsel) return { text: 'The SALOON has lost an O. The barber across the street knows something.', at: at(ansel), thing: 'ansel' };
        return { text: 'The SALOON has lost an O. Ask around. (You are carrying two yourself.)', at: at(marisol), thing: 'marisol' };
      case 7: return { text: 'Tell Marisol her sign is whole.', at: at(marisol), thing: 'marisol' };
      case 8:
        if (f.fennPermit) return { text: 'GRAIN, less its G, is RAIN. PRY the G off the FEED & GRAIN sign.', at: st(FEED), thing: signThing(FEED) };
        return { text: 'Fire at the livery! Buckets will not do it. It needs RAIN. Tobias Fenn is wringing his hands across the street.', at: at(fenn), thing: 'fenn' };
      case 9: return { text: 'The fire is out. Speak to Odalys.', at: at(odalys), thing: 'odalys' };
      case 10: return { text: 'Get to the depot. Someone is at the sign.', at: DEPOT, thing: null };
      case 11: return { text: 'RIDE after him. Dot is waiting by the depot.', at: [dot.x, dot.z], thing: 'dot' };
      default: return { text: 'Chapter one is done. Sundown is yours to wander. Its sun is stuck.', at: null, thing: null };
    }
  }

  // set the world to match the stage (also after loading a save)
  function onStage(n) {
    g.hourCap = n < 4 ? 9.5 : n < 6 ? 12.5 : n < 8 ? 15.2 : n < 11 ? 17.2 : 17.86;
    if (n >= 8 && S().hour < 16.75) S().hour = 16.75;
    if (n >= 11) S().hour = 17.86;
    fire.on = n === 8;
    if (n === 8) fire.size = Math.max(fire.size, 0.6);
    if (n >= 11) { dot.x = -3; dot.z = 116.4; dot.yaw = WEST; pike.x = -1; pike.z = 111.5; pike.path = null; ezra.x = -15; ezra.z = 113.5; }
    else if (n < 10) { dot.x = -100; dot.z = -45; dot.yaw = 0.6; }
    if (n === 6 && g.signs.whole('SALOON') && !F().salonSet) { g.signs.pry('SALOON', 4, false); g.flag('salonSet'); }
    if (n >= 10 && sign(FEED).permit === false && F().fennPermit) sign(FEED).permit = true;
  }

  function enter(isNew) {
    const p = g.player;
    for (const n of [ezra, pike]) { n.x = n.home[0]; n.z = n.home[1]; n.path = null; }
    for (const cr of crows) cr.fly = S().ch > 2 ? 99 : 0;
    fire.size = 0;
    if (isNew) {
      p.x = 9; p.z = 115.6; p.yaw = WEST;
      g.signs.pry('WELL', 0, true); // the first theft, three days ago
      g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.4; g.cam.dist = 17;
    }
    if (F().fennPermit) sign(FEED).permit = true;
    onStage(S().ch);
    dot.ent.hidden = false;
    if (dele) dele.e.hidden = true;
  }

  let rainT = 0, jailT = 0;
  function update(dt) {
    const time = g.engine.time, c = S().ch;
    // Dot stands and breathes
    poseHorse(dot.ent.bones, 0, 0, time);
    m4.rotation(dot.ent.model, 0, 1, 0, dot.yaw);
    dot.ent.model[12] = dot.x; dot.ent.model[13] = land.heightAt(dot.x, dot.z); dot.ent.model[14] = dot.z;
    for (const cr of crows) if (cr.fly > 0) cr.fly += dt;
    // rain falls wherever a sign says RAIN
    const raining = g.signs.reads(FEED) === 'FEED & RAIN';
    rainT = clamp(rainT + (raining ? dt : -dt) * 0.5, 0, 1);
    g.weather.localRain = rainT > 0.01 ? { x: -96, z: 2, r: 46, amount: rainT } : null;
    g.engine.atmo.setWeather(raining ? 'drizzle' : 'clear');
    // the fire grows until it is rained on
    if (fire.on) {
      if (raining) {
        fire.size -= dt * 0.26;
        if (Math.random() < dt * 14) g.particles.emit(KIND.smoke, fire.pos[0] + (Math.random() - 0.5) * 2, fire.pos[1] + 0.6, fire.pos[2] + (Math.random() - 0.5) * 2, 0, 1.2, 0, 3 + Math.random() * 2, 1.6);
        if (fire.size <= 0.05 && !g.busy) {
          fire.on = false; fire.size = 0;
          g.run(async () => {
            good();
            await say('', 'The fire hisses, sulks, and goes out. The whole west end smells of wet hay and relief.');
            g.stand(2);
            g.stage(9, 'Took the G off GRAIN, and it RAINed on the fire.');
          });
        }
      } else fire.size = Math.min(2.3, fire.size + dt * 0.08);
      if (fire.size > 0.05) emitFire(g.particles, fire, dt);
      if (!F().sawFire && Math.hypot(g.player.x - fire.pos[0], g.player.z - fire.pos[2]) < 40) g.flag('sawFire');
    }
    fireLight.intensity = fire.on ? 0.5 + fire.size * 0.6 : 0;
    salonLight.intensity = g.signs.reads('SALOON') === 'SALON' ? 0.9 + 0.15 * Math.sin(time * 2) : 0;
    // the depot, at the appointed hour
    if (c === 10 && !g.busy && Math.hypot(g.player.x - DEPOT[0], g.player.z - DEPOT[1]) < 30) g.run(undown);
    if (dele && !dele.e.hidden && dele.speed > 0) { dele.update(dt, g.engine, g.particles); if (dele.u > 5.5) dele.e.hidden = true; }
    // the long ride out
    if (g.cut) {
      const r = g.cut.rider;
      g.cut.t += dt;
      r.update(dt, g.engine, g.particles);
      g.focus = { x: r.pos[0] + r.heading[0] * 2, y: r.pos[1] + 1.8, z: r.pos[2] + r.heading[1] * 2, dist: 13 + g.cut.t * 1.6, pitch: 0.12, yaw: 1.2 + g.cut.t * 0.035 };
    }
    // too many signs spoiled: the law
    if (S().standing <= -4 && S().pried.length && !g.busy && c < 10 && c !== 8) {
      jailT += dt;
      if (jailT > 1.5) { jailT = 0; g.run(jail); }
    }
  }
  async function jail() {
    await say(pike, 'That is enough. Hand them over.');
    for (const pr of S().pried) {
      const s = g.signs.get(pr.id);
      g.tc.remove(s.text[pr.i]);
      s.have[pr.i] = true; s.caret[pr.i] = false; s.glow = 1;
    }
    S().pried = [];
    g.ui.setCase(g.tc);
    await say('', 'You spend an hour in a cell, reading the word LAW. It has three letters and none of them are yours.');
    await g.lapse(Math.min(g.hourCap, S().hour + 1), 3);
    S().standing = -1;
    S().log.push('Spent an hour in a cell for spoiling signs.');
  }

  function leave() {
    dot.ent.hidden = true;
    if (dele) dele.e.hidden = true;
    if (ride) ride.e.hidden = true;
    fireLight.intensity = 0;
    g.weather.localRain = null;
    g.cut = null;
  }
  leave();

  return { enter, onStage, update, objective, words, leave };
}
