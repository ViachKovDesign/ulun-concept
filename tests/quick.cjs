// Быстрый просмотр: node tests/quick.cjs <url> <width> <height> <out> [scrollToSelector]
const { chromium } = require('playwright');
(async () => {
  const [url, w, h, out, sel] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (sel) { await page.evaluate(s => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY); }, sel); await page.waitForTimeout(1500); }
  await page.screenshot({ path: out });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log('scrollWidth/innerWidth', sw, 'errors', errors);
  await browser.close();
})();
