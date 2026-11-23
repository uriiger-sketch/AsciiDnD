// Screenshots of the real page in headless Chromium.
//   node scripts/shot.cjs <out.png> [width] [height] [save.json] [js to run in page]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [out = 'shots/out.png', w = '1280', h = '720', save = '', js = ''] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: +w < 600, isMobile: +w < 600 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await page.goto((process.env.SUNDOWN_URL || 'file://' + path.resolve(__dirname, '..', 'index.html')));
  await page.waitForFunction(() => window.__ui || window.__error, null, { timeout: 20000 });
  if (save) {
    const json = fs.readFileSync(save, 'utf8');
    await page.evaluate((j) => { const ui = window.__ui; ui.g.restore(j); ui.g.cp = j; ui.mode = 'play'; }, json);
  }
  if (js) await page.evaluate(js);
  await page.waitForTimeout(350);
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => ({ err: window.__error || null, cols: window.__ui && window.__ui.t.cols, rows: window.__ui && window.__ui.t.rows }));
  console.log(out, JSON.stringify(info), logs.slice(0, 6).join(' | '));
  await browser.close();
})();
