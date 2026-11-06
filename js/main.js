/* УЛУН — интерактивный гид по заварке. Без сборщика, без зависимостей кроме GSAP/ScrollTrigger/Lenis (необязательны). */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var params = new URLSearchParams(window.location.search);
  var speed = Math.max(1, Number(params.get('speed')) || 1);
  var hasGsap = typeof window.gsap !== 'undefined';
  var animate = hasGsap && !reduced;
  if (reduced) document.documentElement.classList.add('no-motion');

  /* ---------- Утилиты ---------- */
  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function setText(sel, text) { $$(sel).forEach(function (el) { el.textContent = text; }); }
  var NB = ' ';

  /* ---------- Данные ---------- */
  function inlineData() {
    try { return JSON.parse($('#teas-data').textContent); } catch (e) { return null; }
  }
  function loadData() {
    var fallback = inlineData();
    if (!/^https?:$/.test(window.location.protocol) || !window.fetch) return Promise.resolve(fallback);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 2500);
    return fetch('data/teas.json', ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.ok ? r.json() : fallback; })
      .then(function (d) { clearTimeout(timer); return (d && d.teas) ? d : fallback; })
      .catch(function () { clearTimeout(timer); return fallback; });
  }

  var state = { tea: null, temp: 100, grams: 2 };
  var teas = [];
  var volume = 100;

  /* ---------- Морфинг листа (свой, без плагинов) ---------- */
  var LEAF = {
    curled: 'M2 -22 C16 -22 24 -10 22 4 C20 16 10 24 -2 22 C-14 20 -24 10 -22 -4 C-20 -16 -12 -22 2 -22 Z',
    open: 'M0 -50 C22 -36 34 -6 23 20 C17 34 8 42 0 48 C-8 42 -17 34 -23 20 C-34 -6 -22 -36 0 -50 Z',
    veinCurled: 'M-10 -8 C-2 -14 10 -6 6 6',
    veinOpen: 'M0 -40 C2 -10 2 18 0 46'
  };
  var NUM_RE = /-?\d*\.?\d+/g;
  function morphPath(a, b, t) {
    var na = a.match(NUM_RE).map(Number), nb = b.match(NUM_RE).map(Number), i = 0;
    return b.replace(NUM_RE, function () { var v = na[i] + (nb[i] - na[i]) * t; i++; return (Math.round(v * 100) / 100).toString(); });
  }

  /* ---------- Глава 1: выбор чая ---------- */
  function setTea(id, silent) {
    var tea = teas.filter(function (t) { return t.id === id; })[0] || teas[2] || teas[0];
    state.tea = tea;
    var radio = $('input[name="tea"][value="' + tea.id + '"]');
    if (radio && !radio.checked) radio.checked = true;
    setText('[data-tea-name]', tea.name);
    setText('[data-tea-about]', tea.about);
    setText('[data-tea-example]', tea.example);
    setText('[data-tea-gen]', tea.nameGen);
    $$('[data-tea-icon]').forEach(function (u) { u.setAttribute('href', '#ic-' + tea.id); });
    if (!silent && animate) {
      gsap.fromTo('.jar__icon', { scale: 0.6, rotation: -20, transformOrigin: '50% 50%' }, { scale: 1, rotation: 0, duration: 0.7, ease: 'back.out(2.2)' });
      gsap.fromTo('.jar', { y: 0 }, { y: -10, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' });
    }
    updateTemp(); updateGrams(); updateSteeps(); resetPour(); updateCheat();
  }

  /* ---------- Глава 2: вода и пузырьки ---------- */
  var BUBBLES = [
    { max: 69, name: 'тихая вода, пузырьков почти нет', count: 5, r: [1.5, 2.5], speed: 0 },
    { max: 79, name: '«крабьи глаза» — мелкие пузырьки на дне', count: 12, r: [2, 3], speed: 10 },
    { max: 89, name: '«рыбьи глаза» — пузырьки поднимаются', count: 18, r: [3.5, 5], speed: 34 },
    { max: 97, name: '«нити жемчуга» — цепочки пузырьков', count: 30, r: [2.5, 3.5], speed: 80, chain: true },
    { max: 100, name: 'бурное кипение', count: 44, r: [4, 9], speed: 150, wobble: true }
  ];
  var bubbleState = BUBBLES[4];
  var bubbles = [];
  var bubbleBox = { x1: 96, x2: 326, top: 206, bottom: 400 };
  var CHAIN_X = [130, 170, 212, 252, 292];

  function bubbleConfig(t) {
    for (var i = 0; i < BUBBLES.length; i++) if (t <= BUBBLES[i].max) return BUBBLES[i];
    return BUBBLES[BUBBLES.length - 1];
  }
  function initBubbles() {
    var g = $('[data-bubbles]');
    if (!g) return;
    for (var i = 0; i < 44; i++) {
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('class', 'b s w2');
      g.appendChild(c);
      bubbles.push({ el: c, x: 0, y: 0, r: 2, phase: Math.random() * 6.28, speedK: 0.7 + Math.random() * 0.6 });
    }
  }
  function placeBubble(b, i, fresh) {
    var cfg = bubbleState;
    b.r = cfg.r[0] + Math.random() * (cfg.r[1] - cfg.r[0]);
    b.x = cfg.chain ? CHAIN_X[i % CHAIN_X.length] + (Math.random() * 4 - 2) : bubbleBox.x1 + 10 + Math.random() * (bubbleBox.x2 - bubbleBox.x1 - 20);
    if (cfg.speed === 0 || cfg.speed < 15) {
      b.y = bubbleBox.bottom - b.r - Math.random() * (cfg.speed === 0 ? 4 : 30);
    } else if (fresh) {
      b.y = bubbleBox.top + Math.random() * (bubbleBox.bottom - bubbleBox.top);
    } else {
      b.y = bubbleBox.bottom + b.r;
    }
    if (cfg.chain && fresh) b.y = bubbleBox.bottom - ((Math.floor(i / CHAIN_X.length) * 34 + (i % 3) * 11) % (bubbleBox.bottom - bubbleBox.top));
  }
  function applyBubbleState() {
    bubbles.forEach(function (b, i) {
      var on = i < bubbleState.count;
      b.el.style.display = on ? '' : 'none';
      if (on) placeBubble(b, i, true);
      drawBubble(b);
    });
  }
  function drawBubble(b) {
    b.el.setAttribute('cx', b.x.toFixed(1));
    b.el.setAttribute('cy', b.y.toFixed(1));
    b.el.setAttribute('r', b.r.toFixed(1));
  }
  var bubbleRAF = null, bubbleLast = 0, kettleVisible = false;
  function bubbleTick(now) {
    bubbleRAF = null;
    if (!kettleVisible || reduced) return;
    var dt = Math.min(0.05, (now - (bubbleLast || now)) / 1000);
    bubbleLast = now;
    var cfg = bubbleState;
    for (var i = 0; i < cfg.count; i++) {
      var b = bubbles[i];
      b.phase += dt * 6;
      if (cfg.speed < 15) {
        b.y += Math.sin(b.phase) * 0.15;
        b.x += Math.cos(b.phase * 0.7) * 0.1;
      } else {
        b.y -= cfg.speed * b.speedK * dt;
        if (cfg.wobble) b.x += Math.sin(b.phase) * 0.8;
        if (b.y < bubbleBox.top + 4) placeBubble(b, i, false);
      }
      drawBubble(b);
    }
    bubbleRAF = requestAnimationFrame(bubbleTick);
  }
  function startBubbles() { if (!bubbleRAF && !reduced) { bubbleLast = 0; bubbleRAF = requestAnimationFrame(bubbleTick); } }

  var MOUTH = {
    hit: 'M192 306 C202 322 218 322 228 306',
    hot: 'M192 314 C198 304 204 324 210 314 C216 304 222 324 228 314',
    cold: 'M194 316 C204 312 216 312 226 316'
  };
  function tY(t) { return 360 - (t - 60) / 40 * 260; }

  function tempVerdict(t, tea) { return t < tea.tempMin ? 'cold' : (t > tea.tempMax ? 'hot' : 'hit'); }

  function updateTemp() {
    var tea = state.tea; if (!tea) return;
    var t = state.temp;
    var input = $('#temp');
    if (input && Number(input.value) !== t) input.value = t;
    setRangeFill(input);
    $('#temp-out').textContent = t + NB + '°C';
    var v = tempVerdict(t, tea);
    var range = tea.tempMin + '–' + tea.tempMax + NB + '°C';
    var badge = { hit: 'Попал!', hot: 'Горячо', cold: 'Холодно' }[v];
    var text = {
      hit: 'Ровно то, что нужно для ' + tea.nameGen + ': ' + range + '.',
      hot: 'Для ' + tea.nameGen + ' слишком горячо — лист обварится, чай будет горчить. Нужно ' + range + '.',
      cold: 'Холодновато — лист не раскроется, настой выйдет пустым. Для ' + tea.nameGen + ' нужно ' + range + '.'
    }[v];
    $('[data-temp-badge]').textContent = badge;
    $('[data-temp-text]').textContent = text;
    $('#temp-hint').classList.toggle('is-hit', v === 'hit');
    $('#temp-hint').dataset.verdict = v;
    var cfg = bubbleConfig(t);
    $('[data-bubble-name]').textContent = cfg.name;
    if (cfg !== bubbleState) { bubbleState = cfg; applyBubbleState(); }

    var y = tY(t);
    var merc = $('[data-mercury]');
    var zone = $('[data-zone]');
    var mouth = $('[data-mouth]');
    var steam = $('[data-steam]');
    var zy1 = tY(tea.tempMax), zy2 = tY(tea.tempMin);
    if (animate) {
      gsap.to(merc, { attr: { y: y, height: 404 - y }, duration: 0.35, ease: 'power2.out', overwrite: true });
      gsap.to(zone, { attr: { y: zy1 - 6, height: zy2 - zy1 + 12 }, duration: 0.5, ease: 'power2.out', overwrite: true });
    } else {
      merc.setAttribute('y', y); merc.setAttribute('height', 404 - y);
      zone.setAttribute('y', zy1 - 6); zone.setAttribute('height', zy2 - zy1 + 12);
    }
    mouth.setAttribute('d', MOUTH[v]);
    steam.style.opacity = (0.08 + (t - 60) / 40 * 0.92).toFixed(2);
    $('.kettle-face').classList.toggle('is-hot', v === 'hot');
  }

  /* ---------- Глава 3: весы ---------- */
  var DIAL = { cx: 260, cy: 352, r: 56 };
  var LEAF_SPOTS = [[260, 210], [236, 205], [284, 205], [214, 196], [306, 196], [250, 193], [272, 190], [226, 182], [294, 182], [260, 176], [240, 166], [282, 166]];
  var leafUses = [];
  function gramAngle(g) { return -120 + clamp(g, 0, 12) / 12 * 240; }
  function polar(angleDeg, r) {
    var a = (angleDeg - 90) * Math.PI / 180;
    return [DIAL.cx + r * Math.cos(a), DIAL.cy + r * Math.sin(a)];
  }
  function arcPath(a1, a2, r) {
    var p1 = polar(a1, r), p2 = polar(a2, r);
    var large = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return 'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  function initScale() {
    var ticks = $('[data-dial-ticks]');
    if (!ticks) return;
    ticks.innerHTML = '';
    var d = '';
    for (var g = 0; g <= 12; g++) {
      var a = gramAngle(g), major = g % 3 === 0;
      var p1 = polar(a, major ? 40 : 46), p2 = polar(a, 54);
      d += 'M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' L' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + ' ';
    }
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 's w3'); path.setAttribute('d', d);
    ticks.appendChild(path);
    var holder = $('[data-scale-leaves]');
    LEAF_SPOTS.forEach(function (p, i) {
      var u = document.createElementNS(SVG_NS, 'use');
      u.setAttribute('href', '#leaf');
      u.setAttribute('x', p[0] - 9); u.setAttribute('y', p[1] - 18);
      u.setAttribute('width', 18); u.setAttribute('height', 36);
      var rot = ((i * 47) % 140) - 70;
      u.setAttribute('transform', 'rotate(' + rot + ' ' + p[0] + ' ' + p[1] + ')');
      u.style.display = 'none';
      holder.appendChild(u);
      leafUses.push(u);
    });
  }
  function gramsVerdict(g, tea) { return g < tea.gramsMin ? 'low' : (g > tea.gramsMax ? 'high' : 'hit'); }
  var prevGrams = null;
  function updateGrams() {
    var tea = state.tea; if (!tea) return;
    var g = state.grams;
    var input = $('#grams');
    if (input && Number(input.value) !== g) input.value = g;
    setRangeFill(input);
    $('#grams-out').textContent = g + NB + 'г';
    var v = gramsVerdict(g, tea);
    var range = (tea.gramsMin === tea.gramsMax ? tea.gramsMin : tea.gramsMin + '–' + tea.gramsMax) + NB + 'г';
    $('[data-grams-badge]').textContent = { low: 'Мало', high: 'Много', hit: 'В самый раз' }[v];
    $('[data-grams-text]').textContent = {
      low: 'Будет водянисто. Для ' + tea.nameGen + ' нужно ' + range + ' на 100' + NB + 'мл.',
      high: 'Будет терпко и тяжело. Для ' + tea.nameGen + ' хватит ' + range + ' на 100' + NB + 'мл.',
      hit: g + NB + 'г — отлично для ' + tea.nameGen + '. Для чайника на 200' + NB + 'мл берите ' + (g * 2) + NB + 'г.'
    }[v];
    $('#grams-hint').classList.toggle('is-hit', v === 'hit');
    $('#grams-hint').dataset.verdict = v;
    $('[data-dial-text]').textContent = g + ' г';
    $('[data-gram-zone]').setAttribute('d', arcPath(gramAngle(tea.gramsMin) - 4, gramAngle(tea.gramsMax) + 4, 47));
    var needle = $('[data-needle]');
    var tray = $('[data-tray]');
    var angle = gramAngle(g);
    if (animate) {
      gsap.to(needle, { rotation: angle, svgOrigin: DIAL.cx + ' ' + DIAL.cy, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: true });
      gsap.to(tray, { y: g * 0.6, duration: 0.6, ease: 'elastic.out(1, 0.5)', overwrite: true });
    } else {
      needle.setAttribute('transform', 'rotate(' + angle + ' ' + DIAL.cx + ' ' + DIAL.cy + ')');
      tray.setAttribute('transform', 'translate(0 ' + (g * 0.6) + ')');
    }
    leafUses.forEach(function (u, i) {
      var show = i < g;
      var wasShown = u.style.display !== 'none';
      u.style.display = show ? '' : 'none';
      if (show && !wasShown && animate && prevGrams !== null) {
        gsap.fromTo(u, { y: -90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'bounce.out', delay: (i - Math.max(prevGrams, 0)) * 0.05 });
      }
    });
    prevGrams = g;
  }

  /* ---------- Глава 4: пролив и таймер ---------- */
  var RING_C = 2 * Math.PI * 52;
  var pour = { status: 'idle', raf: null, tl: null, steep: 1, drain: {} };
  function fmtSec(s) { return s + NB + plural(s, ['секунда', 'секунды', 'секунд']); }
  function setLeaf(t) {
    t = clamp(t, 0, 1);
    $('[data-leaf-shape]').setAttribute('d', morphPath(LEAF.curled, LEAF.open, t));
    $('[data-leaf-vein]').setAttribute('d', morphPath(LEAF.veinCurled, LEAF.veinOpen, t));
    var ty = 374 - t * 30, rot = -10 + t * 38, sc = 1 + t * 0.1;
    $('[data-leaf-group]').setAttribute('transform', 'translate(260 ' + ty.toFixed(1) + ') rotate(' + rot.toFixed(1) + ') scale(' + sc.toFixed(3) + ')');
  }
  function setWater(t) {
    var y = 400 - clamp(t, 0, 1) * 98;
    $('[data-bowl-water]').setAttribute('y', y.toFixed(1));
  }
  function setRing(p, sec) {
    $('[data-timer-ring]').style.strokeDashoffset = (RING_C * (1 - clamp(p, 0, 1))).toFixed(2);
    $('[data-timer-sec]').textContent = sec;
  }
  function setPourStatus(text, done) {
    var el = $('[data-pour-status]');
    el.textContent = text;
    el.classList.toggle('is-done', !!done);
  }
  function steepTime(n) { var t = state.tea; return t.time + (n - 1) * t.timeAdd; }
  function steepLabel() { return 'Пролив ' + pour.steep + ' из ' + state.tea.steepsMax; }
  function updateSteepInfo() {
    $('[data-steep-count]').textContent = steepLabel();
    $('[data-tea-time]').textContent = fmtSec(steepTime(pour.steep));
    $$('[data-schedule] li').forEach(function (li, i) {
      var cur = i + 1 === pour.steep;
      li.classList.toggle('is-current', cur);
      if (cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }
  function resetPour() {
    var tea = state.tea; if (!tea) return;
    if (pour.raf) cancelAnimationFrame(pour.raf);
    if (pour.tl) pour.tl.kill();
    if (animate) gsap.killTweensOf(pour.drain);
    pour.status = 'idle';
    pour.steep = 1;
    $('[data-timer-ring]').style.strokeDasharray = RING_C.toFixed(2);
    setRing(0, steepTime(1));
    setLeaf(0); setWater(0);
    var stream = $('[data-stream]');
    stream.style.opacity = 0; stream.style.strokeDashoffset = 400;
    $('[data-kettle]').removeAttribute('transform');
    if (animate) gsap.set('[data-kettle]', { clearProps: 'transform' });
    $('[data-gaiwan-steam]').setAttribute('opacity', 0);
    updateSteepInfo();
    var btn = $('[data-pour]');
    btn.disabled = false; btn.textContent = 'Залить';
    $('[data-pour-reset]').hidden = true;
    setPourStatus(tea.rinse ? 'Лист промыт и прогрет, вода готова.' : 'Лист в гайвани, вода готова.');
    $('.timer').dataset.state = 'idle';
  }
  function startPour() {
    var tea = state.tea;
    if (!tea) return;
    if (pour.status === 'done') {
      if (pour.steep >= tea.steepsMax) return;
      pour.steep += 1;
    } else if (pour.status !== 'idle') return;
    var first = pour.steep === 1;
    if (animate) gsap.killTweensOf(pour.drain);
    pour.status = 'pouring';
    updateSteepInfo();
    setRing(0, steepTime(pour.steep));
    var btn = $('[data-pour]');
    btn.disabled = true;
    btn.textContent = 'Идёт пролив…';
    $('[data-pour-reset]').hidden = true;
    setPourStatus(steepLabel() + ': льём воду…');
    $('.timer').dataset.state = 'pouring';
    var k = Math.min(speed, 4);
    var pourDur = 1.2 / k;
    if (animate) {
      var kettle = $('[data-kettle]');
      var stream = $('[data-stream]');
      var leafObj = { t: 0 };
      var water = { w: 0 };
      pour.tl = gsap.timeline({ onComplete: startTimer })
        .to(kettle, { rotation: 20, svgOrigin: '108 120', duration: 0.45 / k, ease: 'power2.inOut' })
        .set(stream, { opacity: 1 })
        .fromTo(stream, { strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 0.35 / k, ease: 'none' })
        .to(water, { w: 1, duration: pourDur, ease: 'power1.out', onUpdate: function () { setWater(water.w); } }, '<');
      if (first) pour.tl.to(leafObj, { t: 0.3, duration: pourDur, ease: 'power1.out', onUpdate: function () { setLeaf(leafObj.t); } }, '<');
      pour.tl
        .to(stream, { strokeDashoffset: -400, duration: 0.35 / k, ease: 'none' })
        .to(kettle, { rotation: 0, svgOrigin: '108 120', duration: 0.45 / k, ease: 'power2.inOut' }, '<')
        .set(stream, { opacity: 0 });
    } else {
      setWater(1);
      if (first) setLeaf(reduced ? 1 : 0.3);
      startTimer();
    }
  }
  function startTimer() {
    var steep = pour.steep, first = steep === 1;
    var secs = steepTime(steep);
    pour.status = 'steeping';
    $('.timer').dataset.state = 'steeping';
    setPourStatus(steepLabel() + ': ' + (first && !reduced ? 'настаиваем — смотрите, как разворачивается лист.' : 'настаиваем — ждите сигнала.'));
    $('[data-gaiwan-steam]').setAttribute('opacity', 1);
    var total = secs * 1000 / speed;
    var start = performance.now();
    var lastSec = null;
    function tick(now) {
      var p = clamp((now - start) / total, 0, 1);
      var left = Math.ceil(secs * (1 - p));
      if (left !== lastSec) { setRing(p, left); lastSec = left; } else { $('[data-timer-ring]').style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2); }
      if (first && !reduced) setLeaf(0.3 + 0.7 * (animate ? (1 - Math.pow(1 - p, 2)) : p));
      if (p >= 1) { finishPour(); return; }
      pour.raf = requestAnimationFrame(tick);
    }
    pour.raf = requestAnimationFrame(tick);
  }
  function finishPour() {
    var last = pour.steep >= state.tea.steepsMax;
    pour.status = 'done';
    pour.raf = null;
    setRing(1, 0);
    setLeaf(1);
    $('.timer').dataset.state = 'done';
    setPourStatus(last ? 'Сливайте! Это был последний пролив — лист отдал всё.' : 'Сливайте!', true);
    // настой уходит в сливник
    pour.drain = { v: 1 };
    if (animate) {
      gsap.to(pour.drain, { v: 0, duration: 0.8, delay: 0.4, ease: 'power2.in', onUpdate: function () { setWater(this.targets()[0].v); } });
    } else {
      setWater(0);
    }
    var btn = $('[data-pour]');
    if (last) {
      btn.textContent = 'Проливы закончились';
      btn.disabled = true;
    } else {
      btn.textContent = 'Следующий пролив · ' + steepTime(pour.steep + 1) + NB + 'с';
      btn.disabled = false;
    }
    $('[data-pour-reset]').hidden = false;
    if (animate) gsap.fromTo('[data-pour-status]', { scale: 0.7 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', transformOrigin: 'left center' });
  }

  /* ---------- Глава 5: проливы ---------- */
  function initCups() {
    var g = $('[data-cup-slots]');
    if (!g) return;
    for (var i = 0; i < 10; i++) {
      var col = i % 5, row = Math.floor(i / 5);
      var x = 18 + col * 100, y = 16 + row * 140;
      var slot = document.createElementNS(SVG_NS, 'g');
      slot.setAttribute('class', 'cup-slot');
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#cup'); use.setAttribute('x', x); use.setAttribute('y', y);
      use.setAttribute('width', 84); use.setAttribute('height', 84);
      var txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('class', 'cup-num'); txt.setAttribute('x', x + 42); txt.setAttribute('y', y + 110);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = (i + 1);
      slot.appendChild(use); slot.appendChild(txt);
      g.appendChild(slot);
    }
  }
  function updateSteeps() {
    var tea = state.tea; if (!tea) return;
    var range = tea.steepsMin + '–' + tea.steepsMax;
    setText('[data-steeps-range]', range);
    setText('[data-steeps-word]', plural(tea.steepsMax, ['пролив', 'пролива', 'проливов']));
    setText('[data-steeps-note]', tea.steepsNote);
    var slots = $$('.cup-slot');
    slots.forEach(function (s, i) {
      s.classList.toggle('is-full', i < tea.steepsMin);
      s.classList.toggle('is-maybe', i >= tea.steepsMin && i < tea.steepsMax);
      s.classList.toggle('is-off', i >= tea.steepsMax);
    });
    if (animate) gsap.fromTo(slots.slice(0, tea.steepsMax), { y: 10 }, { y: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(3)', overwrite: true });
    $('[data-cups]').setAttribute('aria-label', 'Для ' + tea.nameGen + ' — ' + range + ' проливов');
    $$('[data-tea-row]').forEach(function (row) { row.classList.toggle('is-active', row.getAttribute('data-tea-row') === tea.id); });
    var list = $('[data-schedule]');
    list.innerHTML = '';
    for (var i = 0; i < tea.steepsMax; i++) {
      var li = document.createElement('li');
      if (i >= tea.steepsMin) li.className = 'is-extra';
      var b = document.createElement('b'); b.textContent = (i + 1) + '-й';
      li.appendChild(b);
      li.appendChild(document.createTextNode(' ' + (tea.time + i * tea.timeAdd) + NB + 'с'));
      list.appendChild(li);
    }
  }

  /* ---------- Глава 6: шпаргалка ---------- */
  function cheatData() {
    var tea = state.tea;
    var notes = [];
    if (tempVerdict(state.temp, tea) !== 'hit') notes.push('Вы выбрали ' + state.temp + ' °C — для ' + tea.nameGen + ' лучше ' + tea.tempMin + '–' + tea.tempMax + ' °C.');
    if (gramsVerdict(state.grams, tea) !== 'hit') notes.push('Вы положили ' + state.grams + ' г — для ' + tea.nameGen + ' лучше ' + tea.gramsMin + '–' + tea.gramsMax + ' г.');
    return {
      tea: tea.name,
      temp: state.temp + ' °C',
      grams: state.grams + ' г на ' + volume + ' мл',
      time: tea.time + ' с, дальше +' + tea.timeAdd + ' с',
      steeps: tea.steepsMin + '–' + tea.steepsMax,
      rinse: tea.rinse ? 'да, 5 с' : 'не нужна',
      notes: notes
    };
  }
  function updateCheat() {
    if (!state.tea) return;
    var d = cheatData();
    setText('[data-cheat-tea]', d.tea);
    setText('[data-cheat-temp]', d.temp.replace(' ', NB));
    setText('[data-cheat-grams]', d.grams);
    setText('[data-cheat-time]', d.time);
    setText('[data-cheat-steeps]', d.steeps);
    setText('[data-cheat-rinse]', d.rinse);
    setText('[data-cheat-notes]', d.notes.join(' '));
  }
  function cheatText() {
    var d = cheatData();
    return [
      'УЛУН · шпаргалка',
      'Чай: ' + d.tea,
      'Вода: ' + d.temp,
      'Лист: ' + d.grams,
      'Первый пролив: ' + d.time,
      'Проливов: ' + d.steeps,
      'Промывка: ' + d.rinse
    ].concat(d.notes).join('\n');
  }
  function selectNode(el) {
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } catch (e) { /* ничего */ }
  }
  function copyCheat() {
    var status = $('[data-copy-status]');
    var text = cheatText();
    var fallback = function () {
      selectNode($('[data-cheat]'));
      status.textContent = 'Автоматически скопировать не вышло — карточка выделена, нажмите Ctrl+C (или «Копировать» в меню).';
    };
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard');
      navigator.clipboard.writeText(text).then(function () {
        status.textContent = 'Скопировано! Вставьте в заметки.';
      }, fallback);
    } catch (e) { fallback(); }
  }

  /* ---------- Ползунки ---------- */
  function setRangeFill(input) {
    if (!input) return;
    var min = Number(input.min), max = Number(input.max), v = Number(input.value);
    input.style.setProperty('--pct', ((v - min) / (max - min) * 100).toFixed(1) + '%');
  }

  /* ---------- Меню ---------- */
  function initMenu() {
    var btn = $('.menu-toggle'), nav = $('#site-nav');
    if (!btn) return;
    function set(open) {
      btn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    }
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-expanded') === 'true' && !e.target.closest('.site-header')) set(false);
    });
  }

  /* ---------- Шаги ---------- */
  function initRail() {
    var rail = $('.steps-rail');
    if (!rail || !('IntersectionObserver' in window)) return;
    var links = $$('a', rail);
    var chapters = $$('.chapter');
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) current = Number(en.target.getAttribute('data-step'));
      });
      links.forEach(function (a, i) {
        if (i + 1 === current) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
        a.classList.toggle('is-done', current && i + 1 < current);
      });
    }, { rootMargin: '-48% 0px -48% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
    var guide = $('#guide');
    var first = $('#ch-1'), last = $('#ch-6');
    function check() {
      var vh = window.innerHeight;
      var a = first.getBoundingClientRect().top, b = last.getBoundingClientRect().bottom;
      rail.classList.toggle('is-visible', a < vh * 0.6 && b > vh * 0.4);
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
    void guide;
  }

  /* ---------- Форма ---------- */
  function initBooking() {
    var form = $('#booking');
    if (!form) return;
    form.noValidate = true;
    var date = $('#b-date');
    var today = new Date();
    var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    date.min = iso(today);
    var maxD = new Date(today.getTime()); maxD.setMonth(maxD.getMonth() + 3);
    date.max = iso(maxD);
    var guests = $('#b-guests'), out = $('#b-guests-out');
    var syncGuests = function () { out.textContent = guests.value; setRangeFill(guests); };
    guests.addEventListener('input', syncGuests); syncGuests();

    var checks = [
      { el: date, ok: function (v) { return !!v && v >= date.min && v <= date.max; } },
      { el: $('#b-time'), ok: function (v) { return !!v; } },
      { el: $('#b-name'), ok: function (v) { return v.trim().length >= 2; } },
      { el: $('#b-phone'), ok: function (v) { var d = v.replace(/\D/g, ''); return d.length >= 10 && d.length <= 11; } }
    ];
    function validate(c) {
      var ok = c.ok(c.el.value);
      var err = $('#' + c.el.id + '-err');
      c.el.setAttribute('aria-invalid', String(!ok));
      if (ok) c.el.removeAttribute('aria-describedby'); else c.el.setAttribute('aria-describedby', err.id);
      err.hidden = ok;
      return ok;
    }
    checks.forEach(function (c) {
      // Перепроверяем во время ввода (а не на blur), чтобы подсказки не сдвигали кнопку в момент клика
      c.el.addEventListener('input', function () { if (c.el.getAttribute('aria-invalid') === 'true') validate(c); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      checks.forEach(function (c) { if (!validate(c) && !firstBad) firstBad = c.el; });
      if (firstBad) { firstBad.focus(); return; }
      var d = new Date(date.value + 'T12:00:00');
      var dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      var g = Number(guests.value);
      $('[data-booking-summary]').textContent = $('#b-name').value.trim() + ', ждём вас ' + dateStr + ' в ' + $('#b-time').value + ' — ' + g + ' ' + plural(g, ['гость', 'гостя', 'гостей']) + '. Это демо: на самом деле никто не позвонит.';
      var done = $('[data-booking-done]');
      done.hidden = false;
      done.focus();
      if (animate) gsap.fromTo(done, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    });
  }

  /* ---------- Курсор-листик ---------- */
  function initCursor() {
    if (!animate) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var el = $('.leaf-cursor');
    var xTo = gsap.quickTo(el, 'x', { duration: 0.55, ease: 'power3.out' });
    var yTo = gsap.quickTo(el, 'y', { duration: 0.55, ease: 'power3.out' });
    var rTo = gsap.quickTo(el, 'rotation', { duration: 0.8, ease: 'power3.out' });
    var lastX = 0;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      el.classList.add('is-active');
      xTo(e.clientX); yTo(e.clientY);
      rTo(clamp((e.clientX - lastX) * 2.5, -60, 60) + 20);
      lastX = e.clientX;
      var t = e.target;
      if (t && t.closest) {
        el.classList.toggle('is-on-dark', !!t.closest('.is-inv, .tea-card:has(input:checked), .btn:not(.btn--ghost), .mini--good, .cheat') && !t.closest('.site-header__bar'));
        gsap.to(el, { scale: t.closest('a, button, label, input, select') ? 1.5 : 1, duration: 0.3, overwrite: 'auto' });
      }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { el.classList.remove('is-active'); });
  }

  /* ---------- Анимации прокрутки ---------- */
  var lenis = null;
  function initMotion() {
    if (!animate) return;
    var hasST = typeof window.ScrollTrigger !== 'undefined';
    if (hasST) gsap.registerPlugin(ScrollTrigger);

    if (typeof window.Lenis !== 'undefined') {
      lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1 });
      if (hasST) lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        var id = a.getAttribute('href');
        if (id.length < 2 || a.classList.contains('skip-link')) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        var isChapter = target.classList.contains('chapter');
        lenis.scrollTo(target, { offset: isChapter ? 0 : -80, duration: 1.2 });
        if (history.replaceState) history.replaceState(null, '', id);
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      });
    }

    // Hero: появление
    var intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
    intro.from('.hero__title .line > span', { yPercent: 110, duration: 1.1, stagger: 0.12 })
      .from('.hero .kicker, .hero__text .btn', { y: 24, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.3)
      .from('.hero-pot', { scale: 0.7, opacity: 0, transformOrigin: '50% 100%', duration: 1.1, ease: 'back.out(1.6)' }, 0.2)
      .from('.hero-cup', { x: 40, opacity: 0, duration: 0.8 }, 0.6)
      .from('.hero-leaves use', { scale: 0, opacity: 0, transformOrigin: '50% 50%', duration: 0.8, stagger: 0.08, ease: 'back.out(2)' }, 0.5)
      .from('.four-numbers__item', { y: 40, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.6);
    $$('[data-count]').forEach(function (el) {
      var to = Number(el.getAttribute('data-count')), o = { v: 0 };
      intro.to(o, { v: to, duration: 1.4, ease: 'power2.out', onUpdate: function () { el.textContent = Math.round(o.v); } }, 0.7);
    });
    gsap.to('.hero-leaves use', { y: '+=10', duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.4, from: 'random' } });

    if (!hasST) return;

    // Hero: сцена оживает при прокрутке
    var heroScroll = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 };
    gsap.to('.hero-pot', { rotation: -16, svgOrigin: '300 444', ease: 'none', scrollTrigger: heroScroll });
    gsap.to('.hero-cup', { x: -30, ease: 'none', scrollTrigger: heroScroll });
    $$('.hero-leaves [data-parallax]').forEach(function (el) {
      gsap.to(el, { y: Number(el.getAttribute('data-parallax')), ease: 'none', scrollTrigger: heroScroll });
    });
    gsap.to('.hero__text', { y: -60, ease: 'none', scrollTrigger: heroScroll });

    // Главы
    var mm = gsap.matchMedia();
    $$('.chapter').forEach(function (ch) {
      var parts = $$('.chapter__stage .scene > :not(defs):not(title)', ch);
      if (!parts.length) parts = $$('.chapter__stage > *', ch);
      if (parts.length) gsap.from(parts, {
        opacity: 0, y: 40, scale: 0.9, transformOrigin: '50% 50%', stagger: 0.05, ease: 'back.out(1.6)', duration: 0.9,
        scrollTrigger: { trigger: ch, start: 'top 75%', toggleActions: 'play none none none' }
      });
      gsap.from($$('.chapter__num, .chapter__title, .chapter__text > p:not(.chapter__num)', ch), {
        y: 30, opacity: 0, stagger: 0.07, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: ch, start: 'top 75%', toggleActions: 'play none none none' }
      });
    });
    mm.add('(min-width: 1024px) and (min-height: 700px)', function () {
      $$('.chapter').forEach(function (ch) {
        if (ch.offsetHeight > window.innerHeight + 4) return;
        var stage = $('.chapter__stage .scene', ch) || $('.chapter__stage', ch);
        var tl = gsap.timeline({
          scrollTrigger: { trigger: ch, start: 'top top', end: '+=55%', pin: true, scrub: 0.5, anticipatePin: 1 }
        });
        tl.fromTo(stage, { rotation: -2 }, { rotation: 2, ease: 'none' }, 0)
          .fromTo($('.t1', stage) || stage, { scale: 0.92, transformOrigin: '50% 50%' }, { scale: 1.06, ease: 'none' }, 0);
      });
    });
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  /* ---------- Видимость чайника (пузырьки только когда видно) ---------- */
  function initKettleObserver() {
    var kettle = $('.scene--kettle');
    if (!kettle || !('IntersectionObserver' in window)) { kettleVisible = true; startBubbles(); return; }
    new IntersectionObserver(function (entries) {
      kettleVisible = entries[0].isIntersecting;
      if (kettleVisible) startBubbles();
    }).observe(kettle);
  }

  /* ---------- Старт ---------- */
  function bind() {
    $$('input[name="tea"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setTea(r.value); });
    });
    var temp = $('#temp');
    temp.addEventListener('input', function () { state.temp = Number(temp.value); updateTemp(); updateCheat(); });
    var grams = $('#grams');
    grams.addEventListener('input', function () { state.grams = Number(grams.value); updateGrams(); updateCheat(); });
    $$('[data-pinch]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.grams = clamp(state.grams + Number(b.getAttribute('data-pinch')), 0, 12);
        updateGrams(); updateCheat();
      });
    });
    $('[data-pour]').addEventListener('click', startPour);
    $('[data-pour-reset]').addEventListener('click', function () { resetPour(); $('[data-pour]').focus(); });
    $('[data-copy]').addEventListener('click', copyCheat);
  }

  function init(data) {
    teas = (data && data.teas) || [];
    volume = (data && data.volume) || 100;
    if (!teas.length) return;
    var checked = $('input[name="tea"]:checked');
    state.temp = Number($('#temp').value);
    state.grams = Number($('#grams').value);
    initBubbles(); initScale(); initCups();
    bind();
    setTea(checked ? checked.value : 'oolong', true);
    applyBubbleState();
    initKettleObserver();
    initMenu(); initRail(); initBooking(); initCursor(); initMotion();
  }

  window.ULUN = {
    get state() { return { tea: state.tea && state.tea.id, temp: state.temp, grams: state.grams, pour: pour.status, steep: pour.steep }; },
    setSpeed: function (n) { speed = Math.max(1, Number(n) || 1); },
    cheatText: function () { return cheatText(); }
  };

  function boot() { loadData().then(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
