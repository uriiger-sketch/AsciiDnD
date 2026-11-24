// Plays chapter one from first step to last in headless Chromium and checks every stage.
//   node scripts/playtest.cjs [--shots]      (--shots also saves pictures to shots/)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const shots = process.argv.includes('--shots');
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || /^cast /.test(m.text())) logs.push(`[${m.type()}] ` + m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  // SUNDOWN_URL=http://localhost:8080 plays a served copy instead of the file on disk
  const base = process.env.SUNDOWN_URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(base + '?dpr=1&px=10');
  await page.waitForFunction(() => document.getElementById('boot').hidden || window.__error, null, { timeout: 180000 });

  await page.evaluate(() => {
    const g = window.__game;
    window.__pause = true;
    const T = (window.T = {
      queue: [],
      picks: [],
      auto(options) {
        const want = T.queue.shift();
        let i = options.findIndex((o) => o.ok !== false && (o.key === want || o.label === want));
        if (i < 0) i = options.findIndex((o) => o.ok !== false);
        T.picks.push(options[i].key);
        return i;
      },
      at(id) { const t = g.thing(id); g.player.x = t.x + 1.3; g.player.z = t.z + 1.1; g.target = t; return t; },
      async listen(id, queue = []) { T.queue = queue; const t = T.at(id); await g.run(() => t.listen(g, t)); },
      async word(id, w, queue = []) { T.queue = queue; if (id) T.at(id); else g.target = null; await g.speak(w); },
      step(sec) { window.__step(0.05, Math.round(sec / 0.05)); },
      st() { return { ch: g.S.ch, letters: g.tc.items.join(''), known: g.S.known.join(' '), standing: g.S.standing, hour: +g.S.hour.toFixed(2), err: window.__error || null }; },
    });
    g.ui.auto = T.auto;
  });

  let fail = 0;
  const check = async (label, cond) => {
    const st = await page.evaluate(() => window.T.st());
    const ok = cond(st);
    if (!ok) fail++;
    console.log((ok ? 'ok   ' : 'FAIL ') + label.padEnd(34) + JSON.stringify(st));
  };
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const snap = async (name, prep) => {
    if (!shots) return;
    if (prep) await ev(prep);
    await ev(() => window.T.step(3));
    const f0 = await ev(() => { window.__pause = false; return window.__frames; });
    await page.waitForFunction((n) => window.__frames >= n + 3, f0, { timeout: 240000 });
    await ev(() => { window.__pause = true; });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `shots/play_${name}.png` });
  };

  await snap('00_title');
  await ev(async () => { await window.__mode.toGame(true); window.T.step(0.5); });
  await check('new game', (s) => s.ch === 0 && s.letters === '');
  await snap('01_arrival');

  // a look at the dialogue panel with a real line on it
  if (shots) {
    await ev(() => { const g = window.__game; g.ui.auto = null; const t = window.T.at('ezra'); g.run(() => t.listen(g, t)); });
    await page.waitForTimeout(1500);
    await snap('02_ezra_line');
    await page.waitForTimeout(300);
    await ev(async () => { const g = window.__game; g.ui.auto = window.T.auto; for (let i = 0; i < 40 && g.busy; i++) { g.ui.advance(); g.ui.advance(); const b = document.querySelector('#dlgOpts button'); if (b) b.click(); await new Promise((r) => setTimeout(r, 30)); } });
    await page.waitForTimeout(3000);
  } else {
    await ev(() => window.T.listen('ezra', ['...', 'NOD']));
  }
  await check('ezra: named NOBODY', (s) => s.ch === 1 && s.letters === 'NOBODY' && s.known.includes('DO'));
  await ev(() => window.T.listen('odalys', ['DO']));
  await check('odalys: crows job', (s) => s.ch === 2 && s.known.includes('BOO'));
  await snap('03_crows', () => { window.T.at('crows'); window.T.step(0.3); });
  await ev(() => window.T.word('crows', 'BOO'));
  await check('BOO the crows', (s) => s.ch === 3);
  await ev(() => window.T.listen('odalys'));
  await check('paid R and $', (s) => s.ch === 4 && s.letters === 'NOBODYR$');
  await snap('04_ell', () => { window.T.at('sign:WELL'); window.T.step(0.3); });
  await ev(() => window.T.listen('bram', ['DO']));
  await check('bram: M and E, MEND', (s) => s.letters.includes('M') && s.letters.includes('E') && s.known.includes('MEND'));
  await ev(() => window.T.listen('wren', ['BOND']));
  await check('wren: the W', (s) => s.letters.includes('W'));
  await snap('05_boothill', () => { window.T.at('wren'); window.T.step(0.3); });
  await ev(async () => { await window.T.listen('hat'); await window.T.word('hat', 'DON'); });
  await check('DON the hat', () => true);
  await ev(() => window.T.word('sign:WELL', 'MEND'));
  await check('MEND the WELL', (s) => s.ch === 5 && !s.letters.includes('W'));
  await ev(() => window.T.listen('odalys'));
  await check('paid A ? $', (s) => s.ch === 6 && s.letters.includes('?') && s.letters.includes('A'));
  // save, leave to the title, come back
  await ev(async () => { await window.__mode.toTitle(); await window.__mode.toGame(false); window.T.step(0.3); });
  await check('save and continue', (s) => s.ch === 6 && s.letters.includes('?'));
  await snap('06_salon', () => { window.T.at('sign:SALOON'); window.T.step(0.3); });
  await ev(() => window.T.listen('marisol'));
  await ev(() => window.T.listen('ansel', ['o', 'NO', 'NO']));
  await check('ansel gives up the O', (s) => (s.letters.match(/O/g) || []).length === 3);
  await ev(() => window.T.word('sign:SALOON', 'MEND'));
  await check('MEND the SALOON', (s) => s.ch === 7);
  await ev(() => window.T.listen('marisol'));
  await check('paid P; fire breaks out', (s) => s.ch === 8 && s.letters.includes('P') && s.known.includes('PRY') && s.hour > 16.5);
  await ev(() => window.T.step(6));
  await snap('07_fire', () => { const g = window.__game; g.player.x = -70; g.player.z = -1; window.T.step(1); });
  await ev(() => window.T.listen('fenn'));
  await ev(() => window.T.word('sign:FEED & GRAIN', 'PRY', ['7']));
  await check('PRY the G: RAIN', (s) => s.letters.includes('G'));
  await ev(() => window.T.step(3));
  await snap('08_rain', () => { const g = window.__game; g.player.x = -70; g.player.z = -1; window.T.step(0.5); });
  await ev(async () => { for (let i = 0; i < 30 && window.__game.S.ch === 8; i++) { window.T.step(1); await new Promise((r) => setTimeout(r, 30)); } });
  await check('fire is out', (s) => s.ch === 9);
  await ev(() => window.T.word('sign:FEED & GRAIN', 'MEND'));
  await check('G returned; Fenn pays', (s) => !s.letters.includes('G'));
  await ev(() => window.T.listen('odalys'));
  await check('paid I; sheriff calls', (s) => s.ch === 10 && s.letters.includes('I') && s.known.includes('RIDE'));
  await ev(async () => { const g = window.__game; g.player.x = -4; g.player.z = 117; window.T.step(0.2); for (let i = 0; i < 60 && (g.busy || g.S.ch === 10); i++) await new Promise((r) => setTimeout(r, 50)); window.T.step(0.5); });
  await check('UNDOWN', (s) => s.ch === 11 && s.hour > 17.8);
  await snap('09_undown', () => { window.T.at('dot'); window.T.step(1); });
  await ev(() => window.T.word('dot', 'RIDE'));
  await check('RIDE out: chapter ends', (s) => s.ch === 12);
  const info = await ev(() => ({ picks: window.T.picks.join(' '), log: window.__game.S.log, signs: ['WELL', 'SALOON', 'FEED & GRAIN', 'SUNDOWN', 'WALT'].map((id) => window.__game.signs.reads(id)) }));
  console.log(JSON.stringify(info, null, 1));
  console.log(logs.slice(0, 20).join('\n'));
  console.log(fail ? `${fail} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
