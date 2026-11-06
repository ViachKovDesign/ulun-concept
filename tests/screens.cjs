// Скриншоты всех ширин (полная страница) + проверка консоли и горизонтального скролла.
// Запуск: node tests/screens.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
const path = require('path');
const base = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || path.join(__dirname, '..', 'screenshots');
const sizes = [[375, 812], [768, 1024], [1280, 800], [1920, 1080]];

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.5;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 400));
  });
}

(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await scrollThrough(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `full-${w}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${w}px: горизонтальный перелив ${overflow}px, ошибок в консоли: ${errors.length}`, errors);
    if (overflow > 0 || errors.length) problems++;
    await page.close();
  }
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
