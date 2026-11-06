// Автотест сценария: улун → 90 °C → 7 г → залить → дождаться таймера → шпаргалка совпадает.
// Время ускорено параметром ?speed=20. Запуск: node tests/e2e.cjs [baseUrl]
const { chromium } = require('playwright');
const assert = require('assert');
const base = process.argv[2] || 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?speed=20', { waitUntil: 'networkidle' });

  // 1. Чай
  await page.locator('label.tea-card', { hasText: 'Зелёный' }).click();
  assert.strictEqual(await page.evaluate(() => window.ULUN.state.tea), 'green');
  await page.locator('label.tea-card', { hasText: 'Улун' }).click();
  assert.strictEqual(await page.evaluate(() => window.ULUN.state.tea), 'oolong');
  console.log('✓ выбран улун');

  // 2. Вода
  await page.locator('#temp').fill('100');
  assert.strictEqual(await page.getAttribute('#temp-hint', 'data-verdict'), 'hot');
  await page.locator('#temp').fill('70');
  assert.strictEqual(await page.getAttribute('#temp-hint', 'data-verdict'), 'cold');
  await page.locator('#temp').fill('90');
  assert.strictEqual(await page.getAttribute('#temp-hint', 'data-verdict'), 'hit');
  assert.match(await page.textContent('[data-temp-badge]'), /Попал/);
  console.log('✓ 90 °C — «Попал!»');

  // 3. Лист: со 2 г до 7 г щепотками
  for (let i = 0; i < 5; i++) await page.click('[data-pinch="1"]');
  assert.strictEqual(await page.evaluate(() => window.ULUN.state.grams), 7);
  assert.strictEqual(await page.getAttribute('#grams-hint', 'data-verdict'), 'hit');
  console.log('✓ 7 г — «В самый раз»');

  // 4. Пролив
  await page.click('[data-pour]');
  await page.waitForFunction(() => window.ULUN.state.pour === 'steeping', null, { timeout: 5000 });
  console.log('✓ таймер запущен');
  await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 10000 });
  assert.match(await page.textContent('[data-pour-status]'), /Сливайте!/);
  assert.strictEqual((await page.textContent('[data-timer-sec]')).trim(), '0');
  const leaf = await page.getAttribute('[data-leaf-shape]', 'd');
  assert.ok(leaf.startsWith('M0 -50'), 'лист развернулся: ' + leaf.slice(0, 20));
  console.log('✓ «Сливайте!», лист развернулся');

  // 4б. Следующие проливы по расписанию улуна: 20, 25, 30 … 55 с, всего 8
  assert.strictEqual(await page.textContent('[data-steep-count]'), 'Пролив 1 из 8');
  assert.match(await page.textContent('[data-pour]'), /Следующий пролив · 25/);
  await page.click('[data-pour]');
  await page.waitForFunction(() => window.ULUN.state.steep === 2 && window.ULUN.state.pour === 'steeping', null, { timeout: 5000 });
  assert.strictEqual(await page.textContent('[data-steep-count]'), 'Пролив 2 из 8');
  assert.match(await page.textContent('[data-tea-time]'), /^25\s+секунд$/);
  assert.match(await page.textContent('[data-pour-status]'), /Пролив 2 из 8/);
  assert.strictEqual(await page.getAttribute('[data-schedule] li:nth-child(2)', 'aria-current'), 'step');
  await page.waitForFunction(() => window.ULUN.state.pour === 'done', null, { timeout: 10000 });
  console.log('✓ пролив 2 из 8 — 25 с, завершён');
  await page.evaluate(() => window.ULUN.setSpeed(200));
  for (let n = 3; n <= 8; n++) {
    await page.click('[data-pour]');
    await page.waitForFunction(k => window.ULUN.state.steep === k && window.ULUN.state.pour === 'done', n, { timeout: 10000 });
    assert.strictEqual(await page.textContent('[data-steep-count]'), `Пролив ${n} из 8`);
    assert.match(await page.textContent('[data-tea-time]'), new RegExp('^' + (20 + (n - 1) * 5) + '\\s'));
  }
  assert.ok(await page.isDisabled('[data-pour]'), 'после 8-го пролива кнопка выключена');
  assert.match(await page.textContent('[data-pour]'), /Проливы закончились/);
  assert.match(await page.textContent('[data-pour-status]'), /последний пролив/);
  console.log('✓ проливы 3–8 по расписанию, после 8-го — «Проливы закончились»');
  await page.click('[data-pour-reset]');
  assert.strictEqual(await page.textContent('[data-steep-count]'), 'Пролив 1 из 8');
  assert.strictEqual(await page.isDisabled('[data-pour]'), false);
  console.log('✓ «Заново» возвращает к первому проливу');
  await page.evaluate(() => window.ULUN.setSpeed(20));

  // 5–6. Проливы и шпаргалка
  assert.strictEqual(await page.textContent('[data-steeps-range]'), '6–8');
  const card = {
    tea: await page.textContent('[data-cheat-tea]'),
    temp: (await page.textContent('[data-cheat-temp]')).replace(/ /g, ' '),
    grams: await page.textContent('[data-cheat-grams]'),
    time: await page.textContent('[data-cheat-time]'),
    steeps: await page.textContent('[data-cheat-steeps]'),
    rinse: await page.textContent('[data-cheat-rinse]'),
    notes: await page.textContent('[data-cheat-notes]')
  };
  assert.deepStrictEqual(card, { tea: 'Улун', temp: '90 °C', grams: '7 г на 100 мл', time: '20 с, дальше +5 с', steeps: '6–8', rinse: 'да, 5 с', notes: '' });
  console.log('✓ шпаргалка совпадает:', JSON.stringify(card));

  await page.click('[data-copy]');
  await page.waitForFunction(() => document.querySelector('[data-copy-status]').textContent.length > 0);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes('Чай: Улун') && clip.includes('Вода: 90 °C') && clip.includes('Лист: 7 г на 100 мл'), clip);
  console.log('✓ шпаргалка скопирована в буфер');

  // Форма
  await page.click('.booking__submit');
  assert.strictEqual(await page.getAttribute('#b-date', 'aria-invalid'), 'true');
  const d = new Date(); d.setDate(d.getDate() + 2);
  await page.fill('#b-date', d.toISOString().slice(0, 10));
  await page.selectOption('#b-time', '16:00');
  await page.fill('#b-name', 'Слава');
  await page.fill('#b-phone', '+7 900 000-00-00');
  await page.click('.booking__submit');
  await page.waitForSelector('[data-booking-done]:not([hidden])');
  assert.match(await page.textContent('[data-booking-done]'), /Запись принята \(демо\)/);
  console.log('✓ демо-форма: «Запись принята (демо)»');

  assert.deepStrictEqual(errors, [], 'ошибки в консоли');
  console.log('✓ консоль чистая');
  await browser.close();
  console.log('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
})().catch(e => { console.error('ПРОВАЛ:', e.message); process.exit(1); });
