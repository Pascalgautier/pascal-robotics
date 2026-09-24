/*
 * Pascal Robotics — Pipeline IA
 * Client-side password gate + FR/EN chrome + mobile nav + scroll reveals.
 *
 * NOT server-side security: GitHub Pages serves static files publicly.
 * Anyone can read this source. The gate only deters casual browsing
 * during a working-document / experiment sharing phase.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pr_francis_mct_v1';
  // Light obfuscation — not cryptography. Password: Francis2026
  var EXPECTED = atob('RnJhbmNpczIwMjY=');

  var gate = document.getElementById('gate');
  var doc = document.getElementById('doc');
  var form = document.getElementById('gate-form');
  var input = document.getElementById('gate-pw');
  var err = document.getElementById('gate-error');
  var lockBtn = document.getElementById('lock-again');

  var I18N = {
    fr: {
      "nav.aria": "Navigation principale",
      "lang.aria": "Langue",
      "nav.menu": "Menu",
      "logo.aria": "Pascal Robotics — accueil",
      "logo.alt": "Pascal Robotics",
      "nav.why": "Pourquoi",
      "nav.applications": "Applications",
      "nav.dt": "Digital Twin",
      "nav.eco": "Écosystème LAVAL",
      "nav.pipeline": "Pipeline IA",
      "nav.contact": "Parler de votre cas d’usage ↗",
      "gate.kicker": "Accès restreint",
      "gate.title": "Pipeline IA",
      "gate.body": "Document de travail · Francis × MCT. Entrez le mot de passe pour afficher le contenu.",
      "gate.label": "Mot de passe",
      "gate.submit": "Déverrouiller",
      "gate.note": "Contrôle côté navigateur uniquement (GitHub Pages) — ce n’est pas une sécurité serveur.",
      "gate.error": "Mot de passe incorrect. Réessayez.",
      "gate.lock": "Verrouiller à nouveau"
    },
    en: {
      "nav.aria": "Main navigation",
      "lang.aria": "Language",
      "nav.menu": "Menu",
      "logo.aria": "Pascal Robotics — home",
      "logo.alt": "Pascal Robotics",
      "nav.why": "Why us",
      "nav.applications": "Applications",
      "nav.dt": "Digital Twin",
      "nav.eco": "LAVAL Ecosystem",
      "nav.pipeline": "AI Pipeline",
      "nav.contact": "Talk about your use case ↗",
      "gate.kicker": "Restricted access",
      "gate.title": "AI Pipeline",
      "gate.body": "Working document · Francis × MCT. Enter the password to view the content.",
      "gate.label": "Password",
      "gate.submit": "Unlock",
      "gate.note": "Browser-side check only (GitHub Pages) — not server-side security.",
      "gate.error": "Incorrect password. Please try again.",
      "gate.lock": "Lock again"
    }
  };

  var LANG_KEY = 'pr_lang';
  var currentLang = 'fr';
  try {
    var stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'fr') currentLang = stored;
  } catch (e) {}

  function applyLang(lang) {
    if (!I18N[lang]) lang = 'fr';
    currentLang = lang;
    document.documentElement.lang = lang;
    var dict = I18N[lang];
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (dict[key] != null) el.setAttribute('aria-label', dict[key]);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-alt');
      if (dict[key] != null) el.setAttribute('alt', dict[key]);
    });
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === lang ? 'true' : 'false');
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    if (err && err.dataset.active === '1') {
      err.textContent = dict['gate.error'] || '';
    }
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyLang(btn.getAttribute('data-set-lang'));
    });
  });
  applyLang(currentLang);

  function unlock() {
    gate.hidden = true;
    doc.hidden = false;
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    initReveals();
    if (location.hash) {
      var t = document.querySelector(location.hash);
      if (t) setTimeout(function () { t.scrollIntoView(); }, 40);
    }
  }

  function lock() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    doc.hidden = true;
    gate.hidden = false;
    err.textContent = '';
    err.dataset.active = '';
    if (input) { input.value = ''; input.focus(); }
    window.scrollTo(0, 0);
  }

  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') unlock();
  } catch (e) {}

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = (input && input.value) ? input.value.trim() : '';
      if (val === EXPECTED) {
        err.textContent = '';
        err.dataset.active = '';
        unlock();
      } else {
        err.dataset.active = '1';
        err.textContent = (I18N[currentLang]['gate.error'] || 'Mot de passe incorrect.');
        if (input) { input.value = ''; input.focus(); }
      }
    });
  }
  if (lockBtn) lockBtn.addEventListener('click', lock);

  /* ---------- Mobile ⋮ menu ---------- */
  (function navMore() {
    var nav = document.querySelector('.nav');
    var btn = document.querySelector('.nav-more');
    var panel = document.getElementById('nav-panel');
    if (!nav || !btn || !panel) return;
    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }
    function setOpen(open) {
      if (open === isOpen()) return;
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var first = panel.querySelector('a');
        if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
      }
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        try { btn.focus({ preventScroll: true }); } catch (err) {}
      }
    });
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width:761px)').matches) setOpen(false);
    });
  })();

  /* ---------- Scroll reveals ---------- */
  var revealsReady = false;
  function initReveals() {
    if (revealsReady) return;
    revealsReady = true;
    var nodes = document.querySelectorAll('.reveal, .pipe-step');
    if (!nodes.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    nodes.forEach(function (el, i) {
      if (el.classList.contains('pipe-step')) {
        el.style.transitionDelay = (i % 5) * 0.08 + 's';
      }
      io.observe(el);
    });
  }

  // If already unlocked on load, reveals are started in unlock().
  // If still gated, wait until unlock.
})();
