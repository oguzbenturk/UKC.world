/* Plannivo landing — progressive enhancement only */

(function () {
  'use strict';

  /* Gate animations — content visible without JS */
  document.documentElement.classList.add('js-ready');

  /* ── Reveal on scroll ─────────────────────────────────────────────────── */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ── Count-up for ticker numbers ──────────────────────────────────────── */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const isFloat = String(target).includes('.');
    const decimals = isFloat ? (String(target).split('.')[1] || '').length : 0;
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();

    function tick(now) {
      const elapsed = Math.min(now - start, duration);
      const progress = easeOutExpo(elapsed / duration);
      const value = target * progress;
      el.textContent = (isFloat ? value.toFixed(decimals) : Math.round(value)) + suffix;
      if (elapsed < duration) requestAnimationFrame(tick);
      else el.textContent = (isFloat ? target.toFixed(decimals) : target) + suffix;
    }

    requestAnimationFrame(tick);
  }

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  const tickerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          tickerObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll('[data-count]').forEach((el) => tickerObserver.observe(el));

  /* ── Demo form ────────────────────────────────────────────────────────── */
  /* No backend yet — open the visitor's mail client with a pre-filled
     request so the lead actually reaches hello@plannivo.com. Swap for a
     real fetch() when a lead endpoint exists. */
  const form = document.getElementById('demo-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const email = form.querySelector('input[type="email"]').value.trim();
      const academy = form.querySelector('input[type="text"]').value.trim();

      btn.disabled = true;
      btn.textContent = 'Opening…';

      const subject = encodeURIComponent('Demo request — ' + academy);
      const body = encodeURIComponent(
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
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
