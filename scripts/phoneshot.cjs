// Phone-sized stills of the game UI in real (non-automated) dialogue.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?dpr=1&px=9');
  await page.waitForFunction(() => document.getElementById('boot').hidden || window.__error, null, { timeout: 180000 });
  const still = async (name) => {
    await page.evaluate(() => window.__step(0.05, 60));
    const f0 = await page.evaluate(() => { window.__pause = false; return window.__frames; });
    await page.waitForFunction((n) => window.__frames >= n + 3, f0, { timeout: 240000 });
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/phone_${name}.png` });
  };
  await page.evaluate(() => { window.__pause = true; });
  await still('title');
  // jump to the middle of the chapter with a plausible case of letters
  await page.evaluate(async () => {
    const g = window.__game;
    g.ui.auto = () => 0;
    await window.__mode.toGame(true);
    g.tc.add('NOBODYRMEA?$$');
    g.S.known = ['NOD', 'NO', 'DO', 'BOO', 'MEND', 'BOND'];
    g.S.hour = 10.5;
    g.stage(6, 'test');
    g.ui.setCase(g.tc);
    g.ui.auto = null;
    const t = g.thing('ansel');
    g.player.x = t.x + 1.4; g.player.z = t.z - 1.6;
    g.S.flags.metMari = 1;
    g.run(() => t.listen(g, t));
  });
  // tap through to the choice
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { window.__game.ui.advance(); window.__game.ui.advance(); }); await page.waitForTimeout(200); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('#dlgOpts button')].find((x) => /missing O/.test(x.textContent)); if (b) b.click(); });
  for (let i = 0; i < 4; i++) { await page.evaluate(() => { window.__game.ui.advance(); window.__game.ui.advance(); }); await page.waitForTimeout(200); }
  await still('choice');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#dlgOpts button')].find((x) => /^NO/.test(x.textContent)); if (b) b.click(); });
  for (let i = 0; i < 12; i++) { await page.evaluate(() => { window.__game.ui.advance(); window.__game.ui.advance(); const b = document.querySelector('#dlgOpts button'); if (b) b.click(); }); await page.waitForTimeout(250); }
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; const t = g.thing('sign:SALOON'); g.player.x = t.x + 3; g.player.z = t.z + 1; });
  await still('hud');
  await page.evaluate(() => window.__game.openJournal());
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/phone_journal.png' });
  const info = await page.evaluate(() => ({ err: window.__error || null, sw: document.documentElement.scrollWidth, w: innerWidth }));
  console.log(JSON.stringify(info), logs.slice(0, 8).join('\n'));
  await browser.close();
})();
