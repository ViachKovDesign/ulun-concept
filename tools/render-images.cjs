// Рендер обложки Open Graph (1200×630) и PNG-иконок. Запуск: node tools/render-images.cjs (нужен локальный сервер на 8765)
const { chromium } = require('playwright');
const path = require('path');
const base = process.argv[2] || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto(base + 'tools/og.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(__dirname, '..', 'img', 'og.png') });
  for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
    await p.setViewportSize({ width: size, height: size });
    const pad = name === 'apple-touch-icon.png' ? 'background:#F2EDDC;padding:14px;box-sizing:border-box;' : '';
    await p.setContent(`<html><body style="margin:0;${pad}width:${size}px;height:${size}px"><img src="${base}img/favicon.svg" style="width:100%;height:100%;display:block"></body></html>`);
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, '..', 'img', name), omitBackground: true });
  }
  await b.close();
  console.log('готово');
})();
