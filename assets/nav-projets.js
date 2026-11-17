/* Menu « Projets » : volet au clic sur bureau, lien directement visible dans le menu ⋮. */
(function () {
  var drops = document.querySelectorAll('details.nav-drop');
  if (!drops.length) return;
  var mq = window.matchMedia('(max-width:760px)');

  function summaryOf(d) { return d.querySelector('summary'); }

  function sync() {
    var narrow = mq.matches;
    drops.forEach(function (d) {
      var s = summaryOf(d);
      if (!s) return;
      if (narrow) {
        d.open = true;
        s.setAttribute('tabindex', '-1');
        s.setAttribute('aria-hidden', 'true');
      } else {
        s.removeAttribute('tabindex');
        s.removeAttribute('aria-hidden');
      }
    });
  }

  drops.forEach(function (d) {
    var s = summaryOf(d);
    if (!s) return;
    s.addEventListener('click', function (e) {
      if (mq.matches) e.preventDefault();
    });
  });

  document.addEventListener('click', function (e) {
    if (mq.matches) return;
    drops.forEach(function (d) {
      if (d.open && !d.contains(e.target)) d.open = false;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || mq.matches) return;
    drops.forEach(function (d) {
      if (!d.open) return;
      d.open = false;
      var s = summaryOf(d);
      if (s) { try { s.focus({ preventScroll: true }); } catch (err) {} }
    });
  });

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', function () {
      drops.forEach(function (d) { d.open = mq.matches; });
      sync();
    });
  }

  sync();
})();
