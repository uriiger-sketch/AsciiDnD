// Drives the real page with real taps and keys in headless Chromium.
//   node scripts/uitest.cjs [--shots]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const shots = process.argv.includes('--shots');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  const url = process.env.SUNDOWN_URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url);
  await page.waitForFunction(() => window.__ui || window.__error);
  let fail = 0;
  const check = (label, ok, extra = '') => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); };
  const st = () => page.evaluate(() => { const u = window.__ui, g = u.g, p = g.p; return { mode: u.mode, over: g.over, dialog: !!g.dialog, list: u.list && u.list.title, stage: g.S && g.S.stage, hp: p && p.hp, knife: p && p.knife, x: p && p.x, y: p && p.y, turn: g.S && g.S.turn, foes: g.S ? g.seenFoes().length : 0, sub: u.sub, err: window.__error || null }; });
  // tap the middle of a grid rectangle, in CSS pixels
  const tapCell = async (cx, cy) => {
    const pt = await page.evaluate(([x, y]) => { const t = window.__ui.t, r = t.cv.getBoundingClientRect(); return [r.left + (t.ox + (x + 0.5) * t.cw) / t.dpr, r.top + (t.oy + (y + 0.5) * t.ch) / t.dpr]; }, [cx, cy]);
    await page.touchscreen.tap(pt[0], pt[1]);
    await page.waitForTimeout(60);
  };
  // tap a named control (button, menu line, option) as drawn in the latest frame
  const tapHit = async (name) => {
    await page.waitForTimeout(70);
    const h = await page.evaluate((n) => { const u = window.__ui, k = u.hits.find((h) => h.name && h.name.startsWith(n)); return k ? [k.x + (k.w >> 1), k.y + (k.h >> 1)] : null; }, name);
    if (!h) { console.log('     (no control named ' + name + ')'); return false; }
    await tapCell(h[0], h[1]);
    return true;
  };
  const tapWorld = async (wx, wy) => { const c = await page.evaluate(([x, y]) => { const m = window.__ui.map; return [x - m.x0 + m.x, y - m.y0 + m.y]; }, [wx, wy]); await tapCell(c[0], c[1]); };
  const button = (id) => tapHit(id);
  const snap = async (name) => { if (shots) { await page.waitForTimeout(250); await page.screenshot({ path: `shots/ui_${name}.png` }); } };

  await page.waitForTimeout(300);
  await snap('title');
  check('title screen', (await st()).mode === 'title');
  await tapHit('NEW GAME');
  await page.waitForTimeout(200);
  let s = await st();
  check('NEW GAME starts play with a dialogue', s.mode === 'play' && s.dialog, JSON.stringify(s));
  await snap('intro');
  for (let i = 0; i < 6 && (await st()).dialog; i++) await tapCell(10, 20);
  s = await st();
  check('tapping advances and closes the dialogue', !s.dialog);
  // walk to the knife by tapping its cell: this is auto-travel
  const knife = await page.evaluate(() => window.__ui.g.levels.world.poi.knife);
  await tapWorld(knife[0], knife[1]);
  await page.waitForTimeout(1500);
  s = await st();
  check('tap-to-travel reaches the knife', s.knife === 1 && s.stage === 1, JSON.stringify(s));
  await snap('coyotes');
  // fight: tap whatever is visible; otherwise wait
  for (let i = 0; i < 120; i++) {
    s = await st();
    if (s.stage !== 1) break;
    if (s.over === 'dead') { await tapHit('TRY AGAIN'); await page.waitForTimeout(150); continue; }
    if (s.dialog) { await tapCell(10, 20); continue; }
    const foe = await page.evaluate(() => { const g = window.__ui.g, p = g.p, f = g.seenFoes().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return f ? [f.x, f.y] : null; });
    if (foe) await tapWorld(foe[0], foe[1]); else await button('aim');
    await page.waitForTimeout(170);
  }
  s = await st();
  check('the coyote fight can be won by tapping', s.stage === 2, JSON.stringify(s));
  // keyboard
  const before = await st();
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
  await page.keyboard.press('d'); await page.waitForTimeout(250);
  s = await st();
  check('arrow keys and WASD move', s.x === before.x + 2, `${before.x} -> ${s.x}`);
  // menus
  await button('bag'); await page.waitForTimeout(120);
  check('BAG opens', (await st()).list === 'BAG'); await snap('bag');
  await tapCell(1, 1); await page.waitForTimeout(80);
  check('tapping outside closes it', (await st()).list === null);
  await button('menu'); await page.waitForTimeout(120);
  check('MENU opens', (await st()).list === 'SUNDOWN'); await snap('menu');
  await tapHit('THE LEDGER'); await page.waitForTimeout(120);
  check('LEDGER opens from the menu', (await st()).list === 'THE LEDGER'); await snap('ledger');
  await tapCell(1, 1);
  await page.keyboard.press('?'); await page.waitForTimeout(120);
  check('HOW TO PLAY opens', (await st()).list === 'HOW TO PLAY'); await snap('help');
  await page.keyboard.press('Escape');
  await button('look'); await page.waitForTimeout(80);
  check('LOOK arms', (await st()).sub === 'look');
  await tapWorld(before.x, before.y); await page.waitForTimeout(80);
  check('LOOK describes and disarms', (await st()).sub === null);
  // dying and trying again
  await page.evaluate(() => { const g = window.__ui.g; g.hurt(g.p, 99, { kind: 'coyote' }, {}); });
  await page.waitForTimeout(200);
  check('death shows', (await st()).over === 'dead'); await snap('dead');
  await tapHit('TRY AGAIN'); await page.waitForTimeout(200);
  s = await st();
  check('TRY AGAIN restores the checkpoint', s.over === null && s.hp > 0 && s.mode === 'play', JSON.stringify(s));
  // leave and continue
  await page.reload();
  await page.waitForFunction(() => window.__ui);
  await page.waitForTimeout(300);
  const labels = await page.evaluate(() => window.__ui.hits.length);
  check('a saved game offers CONTINUE', labels === 3); await snap('continue');
  await tapHit('CONTINUE'); await page.waitForTimeout(200);
  s = await st();
  check('CONTINUE resumes', s.mode === 'play' && s.stage >= 1, JSON.stringify(s));
  check('no console errors', logs.length === 0, logs.slice(0, 5).join(' | '));
  console.log(fail ? `${fail} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
