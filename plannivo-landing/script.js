/* Plannivo · dusk — progressive enhancement only. Content works without JS. */
(function () {
  'use strict';

  document.documentElement.classList.add('js-ready');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer  = window.matchMedia('(pointer: fine)').matches;

  /* hooks the engine IIFE fills in, so the reduced-motion listener can reach it */
  var engineHooks = { start: null, stop: null, resize: null };

  /* ══ Reveal fallback (IntersectionObserver) — @supports view() overrides it ══ */
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -36px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ══ Mobile nav disclosure ══ */
  var navToggle = document.querySelector('.nav-toggle');
  var primaryNav = document.getElementById('primary-nav');
  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', function () {
      var open = primaryNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    primaryNav.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('a')) {
        primaryNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ══ Smooth anchor scroll — keeps focus + history honest ══ */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href === '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
      if (window.history && history.pushState) history.pushState(null, '', href);
    });
  });

  /* ══ Horizon progress — travels with scroll like a kite crossing the bay ══
     compositor-only (transform), scrollHeight cached — no per-frame layout   */
  var hFill = document.getElementById('horizon-fill');
  var hKite = document.getElementById('horizon-kite');
  var hTicking = false, hMax = 1, hVw = 1;
  var scrollP = 0;                     /* 0→1 — shared with the engine below */
  function measureHorizon() {
    hMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    hVw = window.innerWidth;
  }
  function updateHorizon() {
    var p = Math.min(1, Math.max(0, window.scrollY / hMax));
    scrollP = p;
    hFill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    hKite.style.transform = 'translateX(' + (p * hVw).toFixed(1) + 'px) rotate(45deg)';
    hTicking = false;
  }
  window.addEventListener('scroll', function () {
    if (hTicking) return;
    hTicking = true;
    requestAnimationFrame(updateHorizon);
  }, { passive: true });
  window.addEventListener('resize', function () { measureHorizon(); updateHorizon(); });
  window.addEventListener('load', function () { measureHorizon(); updateHorizon(); });
  measureHorizon();
  updateHorizon();

  /* ══ Calendar card date — today, never stale ══ */
  var calDate = document.getElementById('cal-date');
  if (calDate) {
    var now = new Date();
    var days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    calDate.textContent = days[now.getDay()] + ' · ' + now.getDate() + ' ' + months[now.getMonth()];
  }

  /* ══ Demo form — mailto until a lead endpoint exists ══ */
  var form = document.getElementById('demo-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var email = form.querySelector('input[type="email"]').value.trim();
      var academy = form.querySelector('input[type="text"]').value.trim();
      var btnHTML = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Opening…';
      setTimeout(function () {           /* never dead-end: allow retry/typo fix */
        btn.disabled = false;
        btn.innerHTML = btnHTML;
      }, 3000);
      var subject = encodeURIComponent('Demo request — ' + academy);
      var body = encodeURIComponent(
        'Academy: ' + academy + '\n' +
        'Contact: ' + email + '\n\n' +
        "We'd like a 20-minute demo of Plannivo."
      );
      window.location.href = 'mailto:hello@plannivo.com?subject=' + subject + '&body=' + body;
      form.classList.add('is-sent');
    });
  }

  /* ══ WIND CARD — fixed representative values by owner's choice ════════════
     No live fetching. The card always shows a clearly-labelled good Urla
     afternoon; the static HTML already carries the same numbers + label. */
  var windCard = document.querySelector('.card-wind');
  var elArrow = document.getElementById('wind-arrow');
  if (windCard) {
    windCard.classList.remove('is-live');
    windCard.setAttribute('aria-label', 'Wind, representative');
  }
  if (elArrow) elArrow.style.transform = 'rotate(328deg)';

  /* ══ CARD PHYSICS — parallax + gust response, one rAF loop ═══════════════ */
  var floats = Array.prototype.map.call(document.querySelectorAll('[data-depth]'), function (el) {
    return {
      el: el,
      depth: parseFloat(el.getAttribute('data-depth')) || 0.6,
      px: 0, py: 0, tx: 0, ty: 0,           /* parallax current/target */
      gx: 0, gvx: 0, gr: 0, gvr: 0, grx: 0, gvrx: 0  /* gust springs */
    };
  });

  if (floats.length) {
    var cardSleeping = true, cardIdleFrames = 0;

    var cardTick = function () {
      if (reduceMotion) { cardSleeping = true; return; }
      var K = 0.045, C = 0.90; /* spring stiffness + damping */
      var energy = 0;
      floats.forEach(function (f) {
        f.px += (f.tx - f.px) * 0.08;
        f.py += (f.ty - f.py) * 0.08;
        f.gvx += -f.gx * K; f.gvx *= C; f.gx += f.gvx;
        f.gvr += -f.gr * K; f.gvr *= C; f.gr += f.gvr;
        f.gvrx += -f.grx * K; f.gvrx *= C; f.grx += f.gvrx;
        var rz = Math.max(-1.6, Math.min(1.6, f.gr));
        var rx = Math.max(-1.2, Math.min(1.2, f.grx));
        var tf =
          'translate3d(' + (f.px + f.gx).toFixed(2) + 'px,' + f.py.toFixed(2) + 'px,0)' +
          ' rotateZ(' + rz.toFixed(3) + 'deg) rotateX(' + rx.toFixed(3) + 'deg)';
        if (tf !== f.lastTf) { f.el.style.transform = tf; f.lastTf = tf; }
        energy += Math.abs(f.tx - f.px) + Math.abs(f.ty - f.py) +
                  Math.abs(f.gvx) + Math.abs(f.gvr) + Math.abs(f.gvrx);
      });
      /* springs at rest → stop scheduling rAF; wakes on pointer / gust */
      if (energy < 0.01) { cardIdleFrames++; } else { cardIdleFrames = 0; }
      if (cardIdleFrames > 30) { cardSleeping = true; return; }
      requestAnimationFrame(cardTick);
    };
    var wakeCards = function () {
      if (reduceMotion || !cardSleeping) return;
      cardSleeping = false;
      cardIdleFrames = 0;
      requestAnimationFrame(cardTick);
    };

    if (finePointer) {
      window.addEventListener('pointermove', function (e) {
        var nx = e.clientX / window.innerWidth - 0.5;
        var ny = e.clientY / window.innerHeight - 0.5;
        floats.forEach(function (f) {
          f.tx = -nx * 14 * f.depth;
          f.ty = -ny * 14 * f.depth;
        });
        wakeCards();
      }, { passive: true });
    }

    /* gusts from the engine load the cards like kites, then release */
    window.addEventListener('gust', function (e) {
      var i = (e.detail && e.detail.intensity) || 0.6;
      floats.forEach(function (f, idx) {
        setTimeout(function () {
          f.gvx += (4 + 6 * i) * f.depth * 0.55;     /* downwind shove */
          f.gvr += (0.5 + 1.1 * i) * f.depth * 0.5;  /* rotateZ load, ≤1.6deg */
          f.gvrx += (0.4 + 0.7 * i) * f.depth * 0.4; /* slight rotateX */
        }, idx * 90); /* the gust front crosses the grid */
      });
      wakeCards();
    });
  }

  /* ══ THE ENGINE — wind-field streamlines, gusts, spray, ocean ════════════ */
  (function engine() {
    var canvas = document.getElementById('sea');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    var fallbackEl = document.querySelector('.engine-fallback');

    var W = 0, H = 0, DPR = 1;
    var budget = false;         /* narrow viewports run a trimmed sim, not none */
    var running = false, rafId = 0;
    var particles = [], spray = [];
    var targetCount = 0;
    var perfLevel = 0;          /* 0 full · 1 half particles+half rate · 2 static fallback */
    var goodWindows = 0;
    var frameTimes = [], lastT = 0;
    var pendingDt = 0, skipToggle = false;
    var t = 0;                  /* sim time, seconds */
    var pointer = { x: -9999, y: -9999, vx: 0, vy: 0, lx: 0, ly: 0, lt: 0 };
    var bgGrad = null;          /* cached page-gradient — the frame fade fill */

    /* gust state */
    var gustAt = 0, gustDur = 2.5, gustStart = -99, gustIntensity = 0;
    function scheduleGust(nowS) { gustAt = nowS + 6 + Math.random() * 8; }

    /* streamline palette — #005F8F → #009EE2 → #5FD9FF */
    var STOPS = [[0,95,143],[0,158,226],[95,217,255]];
    function windColor(u, a) {
      var seg = u < 0.5 ? 0 : 1, f = (u < 0.5 ? u : u - 0.5) * 2;
      var c0 = STOPS[seg], c1 = STOPS[seg + 1];
      var r = (c0[0] + (c1[0] - c0[0]) * f) | 0;
      var g = (c0[1] + (c1[1] - c0[1]) * f) | 0;
      var b = (c0[2] + (c1[2] - c0[2]) * f) | 0;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    /* precomputed LUTs — no rgba string allocation in the hot loop.
       slow marks are dimmer (0.25) → fast marks brighter (0.55): streaks, not dots */
    var STROKES = [];
    for (var ci = 0; ci < 16; ci++) {
      var cu = ci / 15;
      STROKES.push(windColor(cu, (0.25 + 0.3 * cu).toFixed(3)));
    }
    var SPRAYS = [];
    for (var si = 0; si < 10; si++) {
      SPRAYS.push('rgba(95,217,255,' + (0.5 * si / 9).toFixed(3) + ')');
    }

    function desiredCount() {
      var area = W * H;
      var base;
      if (budget) {
        base = Math.max(60, Math.min(110, Math.round(area / 9000)));  /* ~80 on a phone */
      } else {
        base = Math.round(area / 4600);              /* ~280 at 1440×900 */
        var cores = navigator.hardwareConcurrency || 4;
        if (cores <= 4) base = Math.round(base * 0.72);
        base = Math.max(200, Math.min(320, base));
      }
      if (perfLevel >= 1) base = Math.round(base / 2);
      return base;
    }

    function makeParticle(anywhere) {
      return {
        x: anywhere ? Math.random() * W : -Math.random() * 80,  /* spawn band, no seam */
        y: Math.random() * H,
        px: 0, py: 0,
        sp: 0.85 + Math.random() * 0.45,   /* speed floor 0.85 — always a moving streak */
        drift: (Math.random() - 0.5) * 0.3
      };
    }

    function resize() {
      budget = window.innerWidth < 760;
      DPR = budget ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * DPR);   /* also hard-clears the bitmap */
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#081119');
      bgGrad.addColorStop(0.5, '#0A1520');
      bgGrad.addColorStop(1, '#0D1B28');
      targetCount = desiredCount();
      /* keep the existing pool across resizes — no hard visual pop */
      for (var i = 0; i < particles.length; i++) {
        if (particles[i].x > W) particles[i].x = Math.random() * W;
        if (particles[i].y > H) particles[i].y = Math.random() * H;
      }
      if (particles.length > targetCount) particles.length = targetCount;
      while (particles.length < targetCount) particles.push(makeParticle(true));
    }

    /* smooth time-varying flow field: summed sin/cos octaves, dominant +x */
    function fieldAngle(x, y, time) {
      var s = 0.0015;
      return (
        Math.sin(y * s * 2.3 + time * 0.33) * 0.42 +
        Math.cos(x * s * 1.25 - time * 0.21 + y * s * 1.1) * 0.30 +
        Math.sin((x + y) * s * 0.62 + time * 0.5) * 0.18
      );
    }

    function gustEnv(nowS) {
      var p = (nowS - gustStart) / gustDur;
      if (p < 0 || p > 1) return 0;
      return Math.sin(Math.PI * p); /* ease 0→1→0 */
    }

    function spawnSpray(n, gusty) {
      if (perfLevel >= 2 || budget) return;
      for (var i = 0; i < n; i++) {
        spray.push({
          x: gusty ? -10 : pointer.x + (Math.random() - 0.5) * 20,
          y: gusty ? Math.random() * H * 0.85 : pointer.y + (Math.random() - 0.5) * 20,
          vx: 7 + Math.random() * 6,
          vy: (Math.random() - 0.35) * 1.2,
          life: 1
        });
      }
      if (spray.length > 220) spray.splice(0, spray.length - 220);
    }

    function drawOcean(nowS) {
      if (perfLevel >= 2 || budget) return;
      /* the water rises gently as you glide down the page — camera travel */
      var baseY = H * (0.82 - scrollP * 0.06);
      ctx.globalCompositeOperation = 'source-over';
      /* 3 translucent drifting swells */
      for (var l = 0; l < 3; l++) {
        var amp = 6 + l * 5;
        var speed = 0.35 + l * 0.22;
        var yOff = baseY + l * 16;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W; x += 24) {
          var y = yOff + Math.sin(x * 0.008 + nowS * speed + l * 2.1) * amp
                       + Math.sin(x * 0.021 - nowS * speed * 0.7) * amp * 0.4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,' + (70 + l * 22) + ',' + (110 + l * 30) + ',' + (0.10 - l * 0.025) + ')';
        ctx.fill();
      }
      /* dusk warmth caught on the swell tops — 3%, the horizon band only */
      var warm = ctx.createLinearGradient(0, baseY - 46, 0, baseY + 12);
      warm.addColorStop(0, 'rgba(255,158,79,0)');
      warm.addColorStop(1, 'rgba(255,158,79,0.03)');
      ctx.fillStyle = warm;
      ctx.fillRect(0, baseY - 46, W, 58);
      ctx.globalCompositeOperation = 'lighter';
      /* moving crest highlight tracing the top swell */
      ctx.strokeStyle = 'rgba(95,217,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var cx = 0; cx <= W; cx += 24) {
        var cy = baseY + Math.sin(cx * 0.008 + nowS * 0.35 + 0) * 6
                       + Math.sin(cx * 0.021 - nowS * 0.245) * 2.4;
        if (cx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      /* specular horizon — cyan, with the one permitted ember glint */
      var hy = baseY - 4 + Math.sin(nowS * 0.5) * 1.5;
      var grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(0,158,226,0)');
      grad.addColorStop(0.35, 'rgba(0,158,226,0.10)');
      grad.addColorStop(0.45, 'rgba(255,158,79,0.05)');
      grad.addColorStop(0.55, 'rgba(255,158,79,0.12)'); /* ember — horizon only */
      grad.addColorStop(0.65, 'rgba(255,158,79,0.05)');
      grad.addColorStop(0.78, 'rgba(95,217,255,0.10)');
      grad.addColorStop(1, 'rgba(0,158,226,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
    }

    function showFallback() {
      canvas.style.display = 'none';
      if (fallbackEl) fallbackEl.style.display = 'block';
    }

    function frame(nowMs) {
      if (!running) return;
      rafId = requestAnimationFrame(frame);

      var dt = lastT ? Math.min(50, nowMs - lastT) : 16.7;
      lastT = nowMs;

      /* FPS watchdog — measures raw rAF cadence; can escalate AND recover */
      frameTimes.push(dt);
      if (frameTimes.length >= 60) {
        var avg = 0;
        for (var q = 0; q < frameTimes.length; q++) avg += frameTimes[q];
        avg /= frameTimes.length;
        frameTimes.length = 0;
        if (avg > 22) {
          goodWindows = 0;
          if (perfLevel < 2) {
            perfLevel++;
            targetCount = desiredCount();
            if (particles.length > targetCount) particles.length = targetCount;
            if (perfLevel >= 2) {
              /* the sim itself is the cost — stop it and show the static art */
              spray.length = 0;
              stop();
              showFallback();
              return;
            }
          }
        } else if (avg < 18 && perfLevel === 1) {  /* 60Hz cadence ≈ 16.7ms */
          if (++goodWindows >= 3) {
            goodWindows = 0;
            perfLevel = 0;
            targetCount = desiredCount();
          }
        }
      }

      /* perfLevel 1: render at half rate — skipped time carries into the next step */
      if (perfLevel === 1) {
        skipToggle = !skipToggle;
        if (skipToggle) { pendingDt += dt; return; }
      }
      var stepDt = Math.min(50, dt + pendingDt);
      pendingDt = 0;
      t += stepDt / 1000;

      /* gust lifecycle */
      if (t >= gustAt) {
        gustStart = t;
        gustIntensity = 0.4 + Math.random() * 0.6;
        gustDur = 2.2 + Math.random() * 0.8;
        scheduleGust(t + gustDur);
        try {
          window.dispatchEvent(new CustomEvent('gust', { detail: { intensity: gustIntensity } }));
        } catch (err) { /* older browsers — sim continues */ }
      }
      var env = gustEnv(t);
      var speedMul = 1 + 1.4 * gustIntensity * env;  /* 1 → ~2.4 → 1 */
      if (env > 0.25 && Math.random() < 0.35) spawnSpray(2, true);

      /* trail persistence: repaint the page gradient at low alpha (source-over).
         destination-out on an 8-bit canvas never fully clears — permanent ghosting */
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

      drawOcean(t);

      /* streamlines — the flow field drifts with scroll: the camera travels */
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      var dtn = stepDt / 16.7;
      var ft = t + scrollP * 2.2;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.px = p.x; p.py = p.y;
        var a = fieldAngle(p.x, p.y, ft) + p.drift * 0.4;
        var spd = p.sp * 1.9 * speedMul * dtn;
        var vx = Math.cos(a) * spd + spd * 0.9;   /* dominant left→right */
        var vy = Math.sin(a) * spd * 0.62;

        /* pointer = wind deflector */
        var dx = p.x - pointer.x, dy = p.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 19600) { /* 140px */
          var d = Math.sqrt(d2) || 1;
          var push = (1 - d / 140) * 2.6 * dtn;
          vx += (dx / d) * push;
          vy += (dy / d) * push;
        }

        p.x += vx; p.y += vy;

        if (p.x > W + 20 || p.y < -30 || p.y > H + 30) {
          particles[i] = makeParticle(false);
          continue;
        }

        var u = Math.min(1, Math.max(0, (p.sp * speedMul - 0.5) / 1.9));
        ctx.strokeStyle = STROKES[(u * 15) | 0];
        ctx.lineWidth = 0.8 + u * 0.9;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      /* top-up pool if watchdog shrank then recovered viewport */
      while (particles.length < targetCount) particles.push(makeParticle(false));

      /* spray droplets */
      if (spray.length) {
        for (var s = spray.length - 1; s >= 0; s--) {
          var dpl = spray[s];
          dpl.x += dpl.vx * dtn * speedMul;
          dpl.y += dpl.vy * dtn;
          dpl.vy += 0.045 * dtn;         /* slight downward arc */
          dpl.life -= 0.012 * dtn;
          if (dpl.life <= 0 || dpl.x > W + 20 || dpl.y > H + 20) { spray.splice(s, 1); continue; }
          ctx.fillStyle = SPRAYS[Math.max(0, Math.min(9, (dpl.life * 9) | 0))];
          ctx.beginPath();
          ctx.arc(dpl.x, dpl.y, 0.9 + dpl.life * 1.1, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    function start() {
      if (running || reduceMotion || perfLevel >= 2) return;
      running = true;
      lastT = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    /* pointer tracking + fast movement sheds spray */
    if (finePointer) {
      window.addEventListener('pointermove', function (e) {
        var nowP = performance.now();
        var dtp = nowP - pointer.lt;
        if (dtp > 0) {
          pointer.vx = (e.clientX - pointer.lx) / dtp;
          pointer.vy = (e.clientY - pointer.ly) / dtp;
        }
        pointer.lx = e.clientX; pointer.ly = e.clientY; pointer.lt = nowP;
        pointer.x = e.clientX; pointer.y = e.clientY;
        var v = Math.abs(pointer.vx) + Math.abs(pointer.vy);
        if (v > 2.2 && running) spawnSpray(3, false);
      }, { passive: true });
      /* pointerleave does NOT bubble — it lands on <html>, not window */
      var resetPointer = function () {
        pointer.x = -9999; pointer.y = -9999;
        pointer.vx = 0; pointer.vy = 0;
      };
      document.documentElement.addEventListener('pointerleave', resetPointer);
      window.addEventListener('blur', resetPointer);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (reduceMotion) return;
        resize();
        start();
      }, 150);
    });

    engineHooks.resize = resize;
    engineHooks.start = start;
    engineHooks.stop = stop;

    if (!reduceMotion) {
      resize();
      scheduleGust(0);
      gustAt = 2.2 + Math.random() * 3;   /* first gust arrives early */
      start();
    }
  })();

  /* ══ prefers-reduced-motion is live, not a load-time snapshot ═════════════ */
  var rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function onReduceMotionChange(e) {
    reduceMotion = e.matches;
    if (reduceMotion) {
      if (engineHooks.stop) engineHooks.stop();   /* card loop self-sleeps on its flag */
    } else {
      if (engineHooks.resize) engineHooks.resize();
      if (engineHooks.start) engineHooks.start();
    }
  }
  if (rmQuery.addEventListener) rmQuery.addEventListener('change', onReduceMotionChange);
  else if (rmQuery.addListener) rmQuery.addListener(onReduceMotionChange);
})();
