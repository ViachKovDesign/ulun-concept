// Скриншоты состояний: главы, «попал/не попал», таймер, шпаргалки, reduced-motion, без JS.
// Запуск: node tests/states.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
const path = require('path');
const base = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || path.join(__dirname, '..', 'screenshots');
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

async function goTo(page, sel, wait = 1300) {
  await page.evaluate(s => {
    const el = document.querySelector(s);
    const y = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, y);
  }, sel);
  await page.waitForTimeout(wait);
}

async function setRange(page, sel, v) { await page.locator(sel).fill(String(v)); await page.waitForTimeout(500); }

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // Обычный режим: десктоп и телефон
  for (const [w, h, tag] of [[1280, 800, 'desktop'], [375, 812, 'mobile']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(tag + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(tag + ': ' + e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await shot(page, `${tag}-0-hero`);
    for (let i = 1; i <= 6; i++) { await goTo(page, `#ch-${i}`); await shot(page, `${tag}-ch${i}`); }

    if (tag === 'desktop') {
      // Температура: горячо / холодно / попал
      await goTo(page, '#ch-2');
      await setRange(page, '#temp', 100); await shot(page, 'desktop-temp-hot');
      await setRange(page, '#temp', 70); await shot(page, 'desktop-temp-cold');
      await setRange(page, '#temp', 90); await page.waitForTimeout(400); await shot(page, 'desktop-temp-hit');
      // Лист
      await goTo(page, '#ch-3');
      for (let i = 0; i < 5; i++) await page.click('[data-pinch="1"]');
      await page.waitForTimeout(900); await shot(page, 'desktop-grams-hit');
      // Таймер в процессе и завершён
      await goTo(page, '#ch-4');
      await page.click('[data-pour]');
      await page.waitForTimeout(6000); await shot(page, 'desktop-timer-progress');
      await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 30000 });
      await page.waitForTimeout(1400); await shot(page, 'desktop-timer-done');
      // Следующий пролив: «пролив 2 из 8», 25 секунд
      await page.click('[data-pour]');
      await page.waitForTimeout(5000); await shot(page, 'desktop-timer-steep2');
      await page.evaluate(() => window.ULUN.setSpeed(50));
      await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 30000 });
      await goTo(page, '#ch-5'); await shot(page, 'desktop-ch5-current-steep');
      // Шпаргалка: улун
      await goTo(page, '#ch-6'); await shot(page, 'desktop-cheat-oolong');
      // Шпаргалка: зелёный с ошибкой температуры
      await goTo(page, '#ch-1');
      await page.locator('label.tea-card', { hasText: 'Зелёный' }).click();
      await page.waitForTimeout(600); await shot(page, 'desktop-ch1-green');
      await goTo(page, '#ch-5'); await shot(page, 'desktop-ch5-green');
      await goTo(page, '#ch-6'); await shot(page, 'desktop-cheat-green');
      await goTo(page, '#mistakes', 1500); await shot(page, 'desktop-mistakes');
      await goTo(page, '#teahouse', 1500); await shot(page, 'desktop-teahouse');
    } else {
      await goTo(page, '#ch-2'); await setRange(page, '#temp', 90); await page.evaluate(() => document.querySelector('#temp-hint').scrollIntoView({ block: 'center' })); await page.waitForTimeout(800); await shot(page, 'mobile-temp-hit');
      await goTo(page, '#ch-4'); await page.evaluate(() => window.ULUN.setSpeed(4));
      await page.click('[data-pour]'); await page.waitForTimeout(2500);
      await shot(page, 'mobile-timer-progress');
      await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 30000 });
      await page.waitForTimeout(600); await shot(page, 'mobile-timer-done');
      await goTo(page, '#mistakes', 1500); await shot(page, 'mobile-mistakes');
      await goTo(page, '#booking', 1500); await shot(page, 'mobile-booking');
      await page.click('.site-header .menu-toggle'); await page.waitForTimeout(300); await shot(page, 'mobile-menu-open');
    }
    await page.close();
  }

  // Hero на 4 ширинах
  for (const [w, h] of [[375, 812], [768, 1024], [1280, 800], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot(page, `hero-${w}`);
    await page.close();
  }

  // Reduced motion
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('reduced: ' + e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await shot(page, 'reduced-motion-hero');
    await goTo(page, '#ch-4', 300);
    await page.evaluate(() => window.ULUN.setSpeed(10));
    await page.click('[data-pour]');
    await page.waitForTimeout(800);
    await shot(page, 'reduced-motion-pour');
    await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 10000 });
    await page.click('[data-pour]');
    await page.waitForFunction(() => window.ULUN.state.steep === 2 && window.ULUN.state.pour === 'done', null, { timeout: 10000 });
    await shot(page, 'reduced-motion-steep2-done');
    await page.screenshot({ path: path.join(out, 'reduced-motion-full.png'), fullPage: true });
    await ctx.close();
  }

  // Без JavaScript
  for (const w of [1280, 375]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(out, `nojs-${w}.png`), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log(errors.length ? errors : 'Ошибок в консоли нет');
})();
