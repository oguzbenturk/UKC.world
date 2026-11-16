// Landing A page script: autoplay clocks for every scene and the demo form.
// Kept out of index.html on purpose: plannivo.com is served with a CSP whose
// script-src has no 'unsafe-inline', so an inline <script> would never run.
ScrollCraft.mount(document.body);

// NOTHING HERE IS DRIVEN BY SCROLL POSITION. Every scene plays on its own
// clock once it is on screen, like a muted video: it pauses when the reader
// scrolls it away and rewinds once it has left the screen entirely, so coming
// back plays it again. Reduced motion skips playback and shows each scene
// finished. (scrollcraft.js still runs the one-shot data-sc-in reveals.)
var STILL = ScrollCraft.reduce || !('IntersectionObserver' in window);
var STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

function watch(el, on) {
  new IntersectionObserver(function (es) {
    var e = es[es.length - 1];
    if (!e.isIntersecting) { on.pause(); on.rewind(); return; }
    // Share of what can be seen at once: a scene taller than the screen
    // counts as fully shown when it fills the screen.
    var seen = e.intersectionRect.height / Math.max(1, Math.min(e.boundingClientRect.height, innerHeight));
    if (seen >= 0.6) on.play(); else if (seen < 0.35) on.pause();
  }, { threshold: STEPS }).observe(el);
}

// Walks --sc-p on `el` through keyframes [[ms, p], ...] (or a function that
// returns them, so phones can run their own). The CSS reads --sc-p exactly as
// it did when scroll wrote it.
function clock(el, keys, o) {
  o = o || {};
  var t = 0, playing = false, last = 0, raf = 0;
  function k() { return typeof keys === 'function' ? keys() : keys; }
  function end() { var a = k(); return a[a.length - 1][0]; }
  function at(ms) {
    var a = k();
    for (var i = 1; i < a.length; i++) if (ms <= a[i][0]) {
      var u = (ms - a[i - 1][0]) / Math.max(1, a[i][0] - a[i - 1][0]);
      if (o.ease) u = u * u * (3 - 2 * u);
      return a[i - 1][1] + (a[i][1] - a[i - 1][1]) * u;
    }
    return a[a.length - 1][1];
  }
  function paint() { var p = at(t); el.style.setProperty('--sc-p', p.toFixed(4)); if (o.paint) o.paint(p); }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    // A background tab stops rAF; cap the step so coming back never skips ahead.
    if (last) t = Math.min(end(), t + Math.min(now - last, 50));
    last = now; paint();
    if (t >= end()) { playing = false; return; }
    raf = requestAnimationFrame(frame);
  }
  if (STILL) { t = end(); paint(); return; }
  paint();
  watch(o.watch || el, {
    play: function () { if (playing || t >= end()) return; playing = true; last = 0; raf = requestAnimationFrame(frame); },
    pause: function () { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    rewind: function () { t = 0; paint(); }
  });
}

var mq = matchMedia('(max-width: 860px)');

// 1 · Hero: once the cards have landed, the constellation loosens by itself.
(function () {
  var hero = document.querySelector('.hero'), hs = hero.querySelector('.hero__stage');
  clock(hero, [[0, 0], [1000, 0], [2200, 1]], { ease: true, paint: function (p) {
    hs.setAttribute('data-sc-verify-state', String(Math.round(p * 60)));
  } });
})();

// 2 · Tension: the old way dims a beat after the lines arrive.
clock(document.querySelector('.tension'), [[0, 0], [1100, 0], [1800, 1]],
  { ease: true, watch: document.querySelector('.tension .wrap') });

// 3 · Peak: a beat on the empty week, the fill, a hold on the full week, then
// the pair. Phones run their own order (phone first, then the whole week).
(function () {
  var peak = document.querySelector('.peak'), ps = peak.querySelector('.peak__stage');
  var DESK = [[0, 0], [300, 0.07], [3300, 0.67], [3900, 0.70], [5100, 0.96], [5300, 1]];
  var MOB = [[0, 0], [250, 0.06], [2300, 0.50], [2800, 0.62], [3300, 0.70], [5300, 1]];
  clock(peak, function () { return mq.matches ? MOB : DESK; }, { paint: function (b) {
    var s, hold;
    if (mq.matches) {
      s = b < 0.06 ? 'empty' : b < 0.5 ? 'phone:' + Math.round(b * 200) : b < 0.62 ? 'phone-full' : 'week:' + Math.round(b * 200);
      hold = b >= 0.5 && b < 0.62;
    } else {
      s = b < 0.07 ? 'empty' : b < 0.67 ? 'fill:' + Math.round(b * 200) : b < 0.70 ? 'full' : b < 0.91 ? 'pair:' + Math.round(b * 200) : 'pair-held';
      hold = b >= 0.91 || (b >= 0.67 && b < 0.70);
    }
    ps.setAttribute('data-sc-verify-state', s);
    ps.setAttribute('data-sc-verify-hold', hold ? 'true' : 'false');
  } });
})();

// 4 · Substance: a beat on the customer list, then it wipes into finance.
clock(document.querySelector('.swap-act'), [[0, 0], [800, 0], [1600, 1]], { ease: true });

// 5 · Range: THE RAIL WALKS ITSELF, stepwise: a beat on each item (left edge
// to the gutter), then an eased glide to the next. A touch, mouse drag,
// sideways wheel or key inside the rail hands it to the reader for the rest
// of the visit.
(function () {
  var sec = document.querySelector('.range'), st = sec.querySelector('.range__stage'), rail = st.querySelector('.rail');
  var FIRST = 500, HOLD = 900;
  var plan = null, t = 0, playing = false, last = 0, raf = 0, user = false;

  function build() {
    var vw = st.clientWidth, max = Math.max(0, st.scrollWidth - vw);
    var g = parseFloat(getComputedStyle(rail).paddingLeft) || 0, xs = [0], segs = [], at = FIRST;
    Array.prototype.forEach.call(rail.children, function (c) { xs.push(c.offsetLeft - g); });
    xs.push(max);
    xs = xs.map(function (x) { return Math.min(max, Math.max(0, Math.round(x))); })
           .filter(function (x, i, a) { return i === 0 || x - a[i - 1] > 48; });
    if (max - xs[xs.length - 1] > 0) xs[xs.length - 1] = max;
    for (var i = 1; i < xs.length; i++) {
      var d = Math.min(800, Math.max(450, (xs[i] - xs[i - 1]) * 0.55));
      segs.push([at, at + d, xs[i - 1], xs[i]]);
      at += d + HOLD;
    }
    plan = { segs: segs, end: segs.length ? at - HOLD : 0 };
  }
  function x(ms) {
    var s = plan.segs, x0 = 0;
    for (var i = 0; i < s.length; i++) {
      if (ms < s[i][0]) return s[i][2];
      if (ms < s[i][1]) {
        var k = (ms - s[i][0]) / (s[i][1] - s[i][0]);
        k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        return s[i][2] + (s[i][3] - s[i][2]) * k;
      }
      x0 = s[i][3];
    }
    return x0;
  }
  function frame(now) {
    raf = 0;
    if (!playing) return;
    if (last) t = Math.min(plan.end, t + Math.min(now - last, 50));
    last = now;
    st.scrollLeft = x(t);
    if (t >= plan.end) { playing = false; return; }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (playing || user) return;
    if (!plan) build();
    if (t >= plan.end) return;
    playing = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function pause() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function take() { user = true; pause(); }

  // Hand-off. Vertical wheel still scrolls the page; only sideways intent counts.
  st.addEventListener('touchstart', take, { passive: true });
  st.addEventListener('keydown', take);
  st.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) take(); }, { passive: true });
  // Mouse drag, so a desk reader without a trackpad can still move the rail.
  var dx = null;
  st.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    take(); dx = e.clientX + st.scrollLeft; st.classList.add('is-drag'); st.setPointerCapture(e.pointerId);
  });
  st.addEventListener('pointermove', function (e) { if (dx !== null) st.scrollLeft = dx - e.clientX; });
  function drop() { dx = null; st.classList.remove('is-drag'); }
  st.addEventListener('pointerup', drop);
  st.addEventListener('pointercancel', drop);
  addEventListener('resize', function () { plan = null; if (playing) build(); });

  if (STILL) return;
  watch(sec, { play: play, pause: pause, rewind: function () { t = 0; user = false; st.scrollLeft = 0; } });
})();

/* ---- demo form: Web3Forms over fetch, answer shown in place ---------- */
(function () {
  var form = document.querySelector('.ask');
  if (!form || !window.fetch) return;
  var btn = form.querySelector('button[type="submit"]'), msg = form.querySelector('.ask__msg');
  function say(text, tone) { msg.textContent = text; if (tone) msg.dataset.tone = tone; else delete msg.dataset.tone; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (btn.getAttribute('aria-busy') === 'true') return;
    // Sent as plain form data with only an Accept header: a CORS "simple"
    // request, so the browser sends no preflight (Web3Forms' Cloudflare
    // answers a JSON preflight with 403).
    var fd = new FormData(form), data = {};
    if (fd.get('botcheck')) return;
    fd.delete('botcheck');
    fd.forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
    Object.keys(data).forEach(function (k) { fd.set(k, data[k]); });
    fd.set('subject', 'Yeni demo talebi: ' + data['Okul adı']);
    btn.setAttribute('aria-busy', 'true'); say('Gönderiliyor…');
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 15000);
    fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' },
      body: fd, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (!res.success) throw new Error(res.message || 'failed');
        form.querySelector('[data-to]').textContent = data.email;
        form.reset(); form.dataset.state = 'done'; say('');
        form.querySelector('.ask__done').focus({ preventScroll: true });
      })
      .catch(function () { say('Gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.', 'err'); })
      .finally(function () { if (timer) clearTimeout(timer); btn.removeAttribute('aria-busy'); });
  });
})();
