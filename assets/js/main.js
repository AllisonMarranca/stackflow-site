/* StackFlow — shared client script */
(function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Affiliate / CTA click attribution.
  // Replace the console.log with your analytics call (Plausible / GA4 / PostHog).
  document.querySelectorAll('[data-cta]').forEach(function (a) {
    a.addEventListener('click', function () {
      var id = a.getAttribute('data-cta');
      console.log('CTA click:', id, new Date().toISOString());
    });
  });

  // Lightweight, no-backend form confirmation for demo/placeholder forms.
  document.querySelectorAll('form[data-demo]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit], button:not([type])');
      var done = form.getAttribute('data-done') || 'Thanks — check your inbox.';
      if (btn) { btn.textContent = done; btn.disabled = true; }
    });
  });
})();
