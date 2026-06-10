/* Standing Dossier — interaction layer.
   Single-pass scroll reveals, one status typewriter, the □→■ confirm gate. No bounce. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // ---- UTC colophon stamp (honest "rendered at") ----
    var utc = document.querySelector('[data-utc]');
    if (utc) {
      var d = new Date();
      utc.textContent = d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
    }

    // ---- scroll-in: hairline rules draw once, reveals fade once ----
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('drawn');
          io.unobserve(e.target);
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      document.querySelectorAll('[data-rule]').forEach(function (el) { io.observe(el); });
    } else {
      document.querySelectorAll('[data-rule]').forEach(function (el) { el.classList.add('drawn'); });
    }

    // ---- status line: type the verdict tail once ----
    var statusEl = document.querySelector('[data-type]');
    if (statusEl) {
      var tail = statusEl.lastChild; // trailing text node " SHIPS · ..."
      if (tail && tail.nodeType === 3 && !reduce) {
        var full = tail.textContent;
        tail.textContent = '';
        var i = 0;
        (function tick() {
          tail.textContent = full.slice(0, i);
          if (i++ <= full.length) setTimeout(tick, 18);
        })();
      }
    }

    // ---- confirm gate: □ pending -> ■ committed, reveals the channel ----
    document.querySelectorAll('.owner').forEach(function (owner) {
      var gate = owner.querySelector('.gate');
      var chan = owner.querySelector('.chan');
      if (!gate) return;
      gate.setAttribute('aria-expanded', 'false');
      if (chan) chan.setAttribute('aria-live', 'polite');
      gate.addEventListener('click', function () {
        if (owner.classList.contains('armed')) return;
        owner.classList.add('armed');
        gate.querySelector('.box').textContent = '■';
        gate.setAttribute('aria-expanded', 'true');
        var href = owner.getAttribute('data-href');
        var label = owner.getAttribute('data-channel');
        var a = document.createElement('a');
        a.href = href; a.textContent = label;
        a.rel = 'noopener'; a.target = '_blank';
        a.setAttribute('aria-label', label + ' (opens in new tab)');
        chan.textContent = '';
        chan.appendChild(a);
      });
    });
  });
})();
