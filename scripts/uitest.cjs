// Drives the real (non-test) page: clicks through the deck and reports console errors.
const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }]]) {
    const page = await browser.newPage(opts);
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto(url + '?dpr=1&px=12');
    await page.waitForFunction(() => document.getElementById('boot').hidden || window.__error, null, { timeout: 120000 });
    await page.waitForFunction(() => window.__frames >= 2, null, { timeout: 120000 });
    // software rendering is too slow for pointer-level clicks; trigger the handlers directly
    await page.evaluate(() => { for (const id of ['moreBtn', 'sky-storm', 'shot-main', 'fxShadow', 'fxShadow', 'play', 'play']) document.getElementById(id).click(); });
    const f0 = await page.evaluate(() => window.__frames);
    await page.waitForFunction((n) => window.__frames >= n + 3, f0, { timeout: 180000 });
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `shots/ui_${name}.png` });
    const info = await page.evaluate(() => ({ err: window.__error || null, read: document.getElementById('read').textContent, shot: document.getElementById('shotName').textContent, scrollW: document.documentElement.scrollWidth, w: innerWidth }));
    console.log(name, JSON.stringify(info));
    console.log(logs.filter((l) => !/GPU stall/.test(l)).slice(0, 12).join('\n'));
    await page.close();
  }
  await browser.close();
})();
