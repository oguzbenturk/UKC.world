/* Plannivo landing · seaglass — progressive enhancement only */
(function () {
  'use strict';

  /* Gate animations — content visible without JS */
  document.documentElement.classList.add('js-ready');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Respect reduced motion for the SMIL caustic shimmer */
  if (reduceMotion) {
    document.querySelectorAll('svg animate').forEach(function (a) { a.remove(); });
  }

  /* ── Reveal on scroll ─────────────────────────────────────────────────── */
  var revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

  /* ── Product frame: gentle 3D tilt ────────────────────────────────────── */
  var tiltWrap = document.querySelector('.product-float');
  var tiltFrame = document.querySelector('[data-tilt]');
  if (tiltWrap && tiltFrame && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    tiltWrap.addEventListener('pointermove', function (e) {
      var r = tiltWrap.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      tiltFrame.style.transform =
        'rotateX(' + (-y * 3.4).toFixed(2) + 'deg) rotateY(' + (x * 4.2).toFixed(2) + 'deg)';
    });
    tiltWrap.addEventListener('pointerleave', function () {
      tiltFrame.style.transform = '';
    });
  }

  /* ── Demo form ────────────────────────────────────────────────────────── */
  /* No backend yet — open the visitor's mail client with a pre-filled
     request so the lead actually reaches hello@plannivo.com. Swap for a
     real fetch() when a lead endpoint exists. */
  var form = document.getElementById('demo-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var email = form.querySelector('input[type="email"]').value.trim();
      var academy = form.querySelector('input[type="text"]').value.trim();

      btn.disabled = true;
      btn.textContent = 'Opening…';

      var subject = encodeURIComponent('Demo request — ' + academy);
      var body = encodeURIComponent(
        'Academy: ' + academy + '\n' +
        'Contact: ' + email + '\n\n' +
        "We'd like a 20-minute demo of Plannivo."
      );
      window.location.href =
        'mailto:hello@plannivo.com?subject=' + subject + '&body=' + body;

      form.closest('.closer-form').classList.add('is-sent');
    });
  }

  /* ── Smooth scroll for anchor links ──────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href === '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ── Hero chips: slow scroll drift (clipped inside the hero, can never
        overlap other sections) ──────────────────────────────────────────── */
  var drifts = document.querySelectorAll('.drift');
  if (drifts.length && !reduceMotion) {
    var driftTicking = false;
    window.addEventListener('scroll', function () {
      if (driftTicking) return;
      driftTicking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset || 0;
        drifts.forEach(function (d) {
          var rate = parseFloat(d.getAttribute('data-rate')) || 0.2;
          d.style.transform = 'translateY(' + (y * rate).toFixed(1) + 'px)';
        });
        driftTicking = false;
      });
    }, { passive: true });
  }

  /* ── Dashboard mock date: always today, never stale ──────────────────── */
  var prodDate = document.getElementById('prod-date');
  if (prodDate) {
    var now = new Date();
    var days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    prodDate.textContent = days[now.getDay()] + ' · ' + now.getDate() + ' ' + months[now.getMonth()];
  }
})();
