// Renders the built page in headless Chromium and saves a screenshot.
//   node scripts/shot.cjs out.png "shot=main&ui=0" [width] [height] [frames] [deviceScaleFactor]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [out = 'shots/out.png', query = '', w = '1280', h = '720', frames = '3', dsf = '1'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dsf });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?' + query + `&frames=${frames}&test=1`;
  const t0 = Date.now();
  await page.goto(url);
  try {
    await page.waitForFunction(() => window.__done === true || window.__error, null, { timeout: 240000 });
  } catch (e) {
    logs.push('[timeout] ' + e.message.split('\n')[0]);
  }
  const info = await page.evaluate(() => ({ err: window.__error || null, stats: window.__stats || null }));
  await page.screenshot({ path: out });
  console.log(logs.slice(0, 40).join('\n'));
  console.log(JSON.stringify(info), `${Date.now() - t0} ms`);
  await browser.close();
})();
