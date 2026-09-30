/* =====================================================================
   OrchestrAI — scrollytelling 3D  (Pascal Robotics)
   ES module — Three.js r186 + GSAP 3.15 ScrollTrigger, fichiers locaux (assets/vendor/).

   Usage :
     import { init } from './assets/orchestrai/oai-scrollytelling.js';
     const oai = init(document.querySelector('[data-oai-scrolly]'));   // -> { destroy, refresh, getState }

   3 phases pilotées par le scroll (scrub:1) sur une timeline normalisée 0 -> 1 :
     Phase 1 (0.00–0.22)  sphère géodésique wireframe (Icosahedron r=6) qui tourne lentement, caméra z 16 -> 13.5
     Phase 2 (0.22–0.62)  plongée de la caméra (z 13.5 -> 4) : traversée de la membrane à r=6 (~0.49),
                          l'enveloppe s'évase (scale 1 -> 2.1) et s'estompe (opacity 0.6 -> 0.05)
     Phase 3 (0.62–1.00)  caméra stabilisée z=4 ; noyau OAI + satellites en orbite, reliés au noyau ;
                          le groupe interne passe de scale 0.01 / alpha 0 à scale 1 / alpha 1.
   En permanence (requestAnimationFrame, même sans scroll) : micro-rotation du groupe interne,
   orbite des satellites, respiration du halo, tirets animés des liaisons.

   Perf / robustesse : pixelRatio <= 2, pas d'ombres, rendu suspendu hors écran (IntersectionObserver) et onglet caché,
   prefers-reduced-motion => une seule image statique (état final), resize (ResizeObserver), dispose complet,
   chargement paresseux de three/gsap à l'approche de la section, repli propre sans WebGL.

   Mode « embed » (ajouté 2026-09-30, option { embed:true } — la séquence scroll ci-dessus n'est pas modifiée) :
   réutilise la même scène (noyau OAI, halos, satellites, orbites, liaisons, étiquettes) dans un conteneur de même
   structure DOM, SANS GSAP/ScrollTrigger ni hauteur de scroll : l'état est piloté de l'extérieur par
   setEmbedProgress(u) (u : 0 = noyau invisible, caméra éloignée -> 1 = état final de la phase 3). Utilisé par le zoom de
   l'Orbe du hero (orchestrai.html). Options associées : maxPixelRatio, onReady(), onUnavailable() (sans WebGL).
   ===================================================================== */

/* ------------------------------------------------------------------ *
 * 1. Configuration par défaut (surchargeable via init(root, options))
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  vendorBase: new URL('../vendor/', import.meta.url).href, // dossier contenant three-x/ et gsap-x/
  threeDir: 'three-0.186.1/',
  gsapDir: 'gsap-3.15.0/',
  assetQuery: '',           // ex. '?v=20260929' : suffixe de cache-busting ajouté aux scripts GSAP (jamais aux modules three : une seule instance)
  lazy: true,               // charge three/gsap seulement à l'approche de la section
  lazyMargin: '120% 0px',   // distance d'anticipation du chargement
  envelopeRadius: 6,        // rayon de la membrane (la caméra la traverse à cette distance)
  envelopeDetail: 3,        // IcosahedronGeometry detail (3 desktop ; 2 sur petit écran / mobile)
  camera: { fov: 50, zStart: 16, zApproach: 13.5, zEnd: 4 },
  envelopeOpacity: { from: 0.6, to: 0.05 },
  envelopeFlare: 2.1,       // scale final de l'enveloppe (« évasement »)
  embed: false,             // true : scène pilotée par setEmbedProgress(u), sans GSAP ni scroll (voir l'en-tête)
  maxPixelRatio: 2,         // plafond du pixelRatio du renderer
  onReady: null,            // embed : appelé quand la scène WebGL est construite
  onUnavailable: null,      // embed : appelé si three/WebGL est indisponible (aucun bloc de repli n'est ajouté)
  scrub: 1,                 // lissage GSAP du scroll (secondes)
  colors: {                 // fond sombre, lignes bleu/cyan sobres, blanc pour le cœur — pas de vert
    shell: 0x4f9dff, orbit: 0x3d8bff, link: 0x62d7e8, linkDash: 0xb9d8ff,
    satellite: 0x9cc6ff, core: 0xffffff, halo: '127,178,255'
  },
  // Satellites = concepts de l'écosystème OrchestrAI (aucun message commercial).
  // ring : 0 = orbite externe, 1 = orbite interne. Ajouter/retirer une ligne suffit (5 à 7 recommandés).
  satellites: [
    { id: 'agents',  ring: 0, fr: 'Agents IA',       en: 'AI Agents' },
    { id: 'models',  ring: 1, fr: 'Modèles',         en: 'Models' },
    { id: 'tests',   ring: 0, fr: 'Tests',           en: 'Tests' },
    { id: 'infra',   ring: 1, fr: 'Infrastructure',  en: 'Infrastructure' },
    { id: 'dt',      ring: 0, fr: 'Digital Twin',    en: 'Digital Twin' },
    { id: 'providers', ring: 1, fr: 'Providers',     en: 'Providers' },
    { id: 'physical', ring: 0, fr: 'Physical AI',    en: 'Physical AI' }
  ],
  // Textes bilingues (les termes Digital Twin / Physical AI / OAI restent en anglais dans les deux langues)
  i18n: {
    fr: {
      'sec.aria': 'Séquence 3D : de la sphère à l’intérieur d’OrchestrAI',
      'cap1.k': 'Le paysage IA', 'cap1.t': 'Trop de modèles. <em>Trop de plateformes.</em>',
      'cap1.p': 'Une enveloppe complexe, vue de l’extérieur.',
      'cap2.k': 'Traversée', 'cap2.t': 'Entrer <em>dans l’orchestration.</em>',
      'cap2.p': 'On franchit la membrane pour regarder ce qui se passe à l’intérieur.',
      'cap3.k': 'Au centre', 'cap3.t': 'Un noyau, <em>tout un écosystème.</em>',
      'cap3.p': 'OAI coordonne agents, modèles, providers, tests et infrastructures. Représentation visuelle du concept — OrchestrAI est en développement.',
      'cue': 'Défiler', 'core': 'O<b>AI</b>',
      'sr': 'Animation 3D : une sphère géodésique que la caméra traverse pour révéler, au centre, le noyau OAI entouré de ses concepts : ',
    },
    en: {
      'sec.aria': '3D sequence: from the sphere to the inside of OrchestrAI',
      'cap1.k': 'The AI landscape', 'cap1.t': 'Too many models. <em>Too many platforms.</em>',
      'cap1.p': 'A complex envelope, seen from the outside.',
      'cap2.k': 'Crossing', 'cap2.t': 'Stepping <em>into orchestration.</em>',
      'cap2.p': 'We cross the membrane to look at what happens inside.',
      'cap3.k': 'At the centre', 'cap3.t': 'One core, <em>a whole ecosystem.</em>',
      'cap3.p': 'OAI coordinates agents, models, providers, tests and infrastructure. Visual representation of the concept — OrchestrAI is in development.',
      'cue': 'Scroll', 'core': 'O<b>AI</b>',
      'sr': '3D animation: a geodesic sphere the camera flies through, revealing the OAI core at the centre, surrounded by its concepts: ',
    }
  }
};

/* ------------------------------------------------------------------ *
 * 2. Utilitaires
 * ------------------------------------------------------------------ */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function deepMerge(base, extra) {
  if (!extra) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Langue : `pr-lang` lu en premier, puis `pr_lang`, puis <html lang>. */
function readLang() {
  try {
    const s = localStorage.getItem('pr-lang') || localStorage.getItem('pr_lang');
    if (s === 'en' || s === 'fr') return s;
  } catch (e) { /* stockage indisponible */ }
  return (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
}

/** Charge un script classique (UMD GSAP) une seule fois. */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement impossible : ' + src));
    document.head.appendChild(s);
  });
}

/** Texture de halo (dégradé radial) générée en canvas — aucun fichier image. */
function makeHaloTexture(THREE, rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.16, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.14)`);
  grad.addColorStop(1.0, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ *
 * 3. init(root, options)
 * ------------------------------------------------------------------ */
export function init(root, options = {}) {
  if (!root) return null;
  const cfg = deepMerge(DEFAULTS, options);
  const $ = (sel) => root.querySelector(sel);
  const els = {
    sticky: $('.oai-scrolly__sticky'),
    canvas: $('.oai-scrolly__canvas'),
    labels: $('.oai-scrolly__labels'),
    caps: [1, 2, 3].map((n) => $(`.oai-cap[data-phase="${n}"]`)),
    cue: $('.oai-scrolly__cue'),
    bar: $('.oai-scrolly__bar i'),
    sr: $('.oai-sr[data-oai-sr]')
  };
  if (!els.sticky || !els.canvas) return null;

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mqReduce.matches;
  let destroyed = false;
  let lang = readLang();
  let api = null;           // rempli quand three/gsap sont chargés
  const cleanups = [];      // fonctions de nettoyage (listeners, observers…)
  const embed = !!cfg.embed;
  let embedU = 0;           // progression embed (0 -> 1)

  /* ---------- Textes bilingues ---------- */
  const t = (key) => (cfg.i18n[lang] && cfg.i18n[lang][key]) ?? cfg.i18n.fr[key] ?? '';
  function applyText() {
    root.setAttribute('aria-label', t('sec.aria'));
    root.querySelectorAll('[data-oai-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.oaiI18n); });
    if (els.sr) els.sr.textContent = t('sr') + cfg.satellites.map((s) => s[lang] || s.fr).join(', ') + '.';
    if (api) api.setLabelsText();
  }
  function onLang() { lang = readLang(); applyText(); }
  document.addEventListener('pr:lang', onLang);                 // événement émis par le sélecteur de langue du site
  window.addEventListener('storage', onLang);                   // autre onglet
  const langObs = new MutationObserver(onLang);                 // <html lang> modifié
  langObs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  cleanups.push(() => {
    document.removeEventListener('pr:lang', onLang);
    window.removeEventListener('storage', onLang);
    langObs.disconnect();
  });
  applyText();

  /* ---------- Mode : « live » (section haute + scroll) ou statique ---------- */
  // Le hauteur de la section est fixée tout de suite (pas de saut de page au chargement différé).
  const setLive = (on) => { if (!embed) root.classList.toggle('is-live', on); };
  setLive(!reduced);

  const onMotionChange = () => { reduced = mqReduce.matches; rebuild(); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMotionChange);
  else if (mqReduce.addListener) mqReduce.addListener(onMotionChange);
  cleanups.push(() => {
    if (mqReduce.removeEventListener) mqReduce.removeEventListener('change', onMotionChange);
    else if (mqReduce.removeListener) mqReduce.removeListener(onMotionChange);
  });

  /* ---------- Chargement paresseux ---------- */
  let loadStarted = false;
  let loadIO = null;
  function startLoad() {
    if (loadStarted || destroyed) return;
    loadStarted = true;
    load().then(build).catch((err) => {
      console.warn('[oai-scrollytelling] repli statique :', err && err.message ? err.message : err);
      fallback();
    });
  }
  if (cfg.lazy && 'IntersectionObserver' in window) {
    loadIO = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { loadIO.disconnect(); loadIO = null; startLoad(); }
    }, { rootMargin: cfg.lazyMargin });
    loadIO.observe(root);
    cleanups.push(() => loadIO && loadIO.disconnect());
  } else {
    startLoad();
  }

  async function load() {
    const base = cfg.vendorBase;
    const three = base + cfg.threeDir;
    const gsapUrl = base + cfg.gsapDir;
    const [THREE, css2d] = await Promise.all([
      import(three + 'three.module.min.js'),
      import(three + 'CSS2DRenderer.min.js')
    ]);
    if (!embed) {
      if (!window.gsap) await loadScript(gsapUrl + 'gsap.min.js' + cfg.assetQuery);
      if (!window.ScrollTrigger) await loadScript(gsapUrl + 'ScrollTrigger.min.js' + cfg.assetQuery);
    }
    return { THREE, CSS2DRenderer: css2d.CSS2DRenderer, CSS2DObject: css2d.CSS2DObject };
  }

  /** Sans WebGL / échec de chargement : bloc statique lisible (phase 3 en texte + puces). */
  function fallback() {
    if (embed) { if (cfg.onUnavailable) cfg.onUnavailable(); return; }
    setLive(false);
    root.classList.add('is-nogl');
    if (!root.querySelector('.oai-scrolly__fallback')) {
      const ul = document.createElement('ul');
      ul.className = 'oai-scrolly__fallback';
      ul.setAttribute('aria-hidden', 'true');
      ul.dataset.oaiFallback = '';
      els.sticky.appendChild(ul);
    }
    const ul = root.querySelector('.oai-scrolly__fallback');
    ul.innerHTML = cfg.satellites.map((s) => `<li>${s[lang] || s.fr}</li>`).join('');
  }

  let libs = null;
  function build(l) {
    if (destroyed) return;
    libs = l;
    rebuild();
  }

  /** (Re)crée l'expérience selon le mode courant (animé ou reduced-motion). */
  function rebuild() {
    if (!libs || destroyed) return;
    if (api) { api.dispose(); api = null; }
    setLive(!reduced);
    root.classList.remove('is-nogl');
    try {
      api = createScene(libs, reduced);
      root.classList.add('is-ready');
      if (embed && cfg.onReady) cfg.onReady();
    } catch (err) {
      console.warn('[oai-scrollytelling] WebGL indisponible :', err && err.message ? err.message : err);
      fallback();
    }
  }

  /* ================================================================ *
   * 4. Scène Three.js + timeline GSAP
   * ================================================================ */
  function createScene({ THREE, CSS2DRenderer, CSS2DObject }, isStatic) {
    const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    const C = cfg.colors;
    const R = cfg.envelopeRadius;
    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    /* ----- Renderer : pixelRatio plafonné, pas d'ombres, canvas transparent (le fond est en CSS) ----- */
    const renderer = new THREE.WebGLRenderer({
      canvas: els.canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio));
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);

    const labelRenderer = new CSS2DRenderer({ element: document.createElement('div') });
    labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    els.labels.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, 0.1, 80);
    camera.position.set(0, 0, cfg.camera.zStart);

    /* ----- État piloté par la timeline (valeurs lues à chaque frame) ----- */
    const S = {
      camZ: cfg.camera.zStart, fov: cfg.camera.fov,
      shellScale: 1, shellAlpha: cfg.envelopeOpacity.from,
      innerScale: 0.01, innerAlpha: 0,
      progress: 0
    };

    /* ----- Phase 1/2 : enveloppe géodésique wireframe ----- */
    const small = window.innerWidth < 760;
    const detail = small ? Math.min(2, cfg.envelopeDetail) : cfg.envelopeDetail;
    const shellGeo = track(new THREE.IcosahedronGeometry(R, detail));
    const shellMat = track(new THREE.MeshBasicMaterial({
      color: C.shell, wireframe: true, transparent: true, opacity: S.shellAlpha, depthWrite: false
    }));
    const shell = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shell);

    /* ----- Phase 3 : groupe interne (noyau + satellites + liaisons) ----- */
    const inner = new THREE.Group();
    inner.scale.setScalar(S.innerScale);
    inner.visible = false;
    scene.add(inner);

    const fade = []; // { mat, base } — opacité = base * innerAlpha
    const addFade = (mat, base) => { mat.transparent = true; mat.depthWrite = false; fade.push({ mat, base }); mat.opacity = 0; return mat; };
    const haloTex = track(makeHaloTexture(THREE, C.halo));

    // Noyau OAI : sphère émissive blanche + 2 halos (sprites additifs)
    const coreGeo = track(new THREE.SphereGeometry(0.15, 32, 24));
    const coreMat = track(addFade(new THREE.MeshBasicMaterial({ color: C.core }), 1));
    const core = new THREE.Mesh(coreGeo, coreMat);
    inner.add(core);
    const haloA = new THREE.Sprite(track(addFade(new THREE.SpriteMaterial({
      map: haloTex, color: 0xffffff, blending: THREE.AdditiveBlending }), 0.95)));
    haloA.scale.setScalar(1.1);
    const haloB = new THREE.Sprite(track(addFade(new THREE.SpriteMaterial({
      map: haloTex, color: 0x6fa8ff, blending: THREE.AdditiveBlending }), 0.42)));
    haloB.scale.setScalar(2.9);
    inner.add(haloB, haloA);

    // Étiquette du noyau (CSS2D : texte net)
    const mkLabel = (cls) => {
      const d = document.createElement('div'); d.className = 'oai-label ' + cls;
      const s = document.createElement('span'); s.className = 'oai-label__t'; d.appendChild(s);
      return { div: d, span: s };
    };
    const coreLabel = mkLabel('oai-label--core');
    const coreLabelObj = new CSS2DObject(coreLabel.div);
    inner.add(coreLabelObj);

    // Orbites (deux anneaux elliptiques inclinés, très discrets)
    const RINGS = [{ k: 1.0, speed: 0.11 }, { k: 0.6, speed: -0.17 }];
    const unitEllipse = (() => {
      const n = 160, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.set([Math.cos(a), Math.sin(a), Math.sin(a)], i * 3); }
      const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g;
    })();
    const ringMeshes = RINGS.map((r) => {
      const m = track(addFade(new THREE.LineBasicMaterial({ color: C.orbit, blending: THREE.AdditiveBlending }), 0.22));
      const l = new THREE.LineLoop(unitEllipse, m); inner.add(l); return l;
    });

    // Satellites + liaisons noyau -> satellite (trait fin + tirets animés) + « impulsions » qui circulent
    const satGeo = track(new THREE.SphereGeometry(0.055, 20, 16));
    const satMat = track(addFade(new THREE.MeshBasicMaterial({ color: C.satellite }), 1));
    const haloSatMat = track(addFade(new THREE.SpriteMaterial({
      map: haloTex, color: 0x7fb2ff, blending: THREE.AdditiveBlending }), 0.55));
    const linkSolidMat = track(addFade(new THREE.LineBasicMaterial({ color: C.link, blending: THREE.AdditiveBlending }), 0.30));
    const linkDashMat = track(addFade(new THREE.LineDashedMaterial({
      color: C.linkDash, dashSize: 0.09, gapSize: 0.09, blending: THREE.AdditiveBlending }), 0.85));
    const pulseGeo = track(new THREE.BufferGeometry());
    const pulsePos = new Float32Array(cfg.satellites.length * 3);
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
    const pulseMat = track(addFade(new THREE.PointsMaterial({
      color: 0xffffff, size: 0.05, sizeAttenuation: true, blending: THREE.AdditiveBlending, map: haloTex }), 0.9));
    const pulses = new THREE.Points(pulseGeo, pulseMat);
    pulses.frustumCulled = false;
    inner.add(pulses);

    const ringCount = [0, 0];
    cfg.satellites.forEach((s) => { ringCount[s.ring || 0]++; });
    const ringIdx = [0, 0];
    const sats = cfg.satellites.map((s, i) => {
      const ring = s.ring || 0;
      const idx = ringIdx[ring]++;
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(satGeo, satMat));
      const h = new THREE.Sprite(haloSatMat); h.scale.setScalar(0.42); obj.add(h);
      const label = mkLabel(''); const lobj = new CSS2DObject(label.div); obj.add(lobj);
      inner.add(obj);
      // liaison : 2 sommets (noyau, satellite) mis à jour à chaque frame
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const solid = new THREE.Line(geo, linkSolidMat);
      const dashed = new THREE.Line(geo, linkDashMat);
      solid.frustumCulled = dashed.frustumCulled = false;
      inner.add(solid, dashed);
      return {
        cfg: s, ring, obj, label, geo, dashed,
        theta0: (idx / ringCount[ring]) * Math.PI * 2 + (ring ? Math.PI / ringCount[ring] : 0.35),
        pulsePhase: (i * 0.377) % 1,
        wob: i * 1.7
      };
    });

    function setLabelsText() {
      coreLabel.span.innerHTML = t('core');
      sats.forEach((s) => { s.label.span.textContent = s.cfg[lang] || s.cfg.fr; });
    }
    setLabelsText();

    /* ----- Mise en page responsive : ellipses calées sur ce que la caméra (z=4) voit ----- */
    const layout = { A: 1.8, B: 0.9, D: 0.55, dy: 0 };
    let W = 1, H = 1;
    function resize() {
      W = Math.max(1, els.sticky.clientWidth); H = Math.max(1, els.sticky.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio));
      renderer.setSize(W, H, false);
      labelRenderer.setSize(W, H);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      const zEnd = cfg.camera.zEnd;
      const hh = zEnd * Math.tan((cfg.camera.fov * Math.PI) / 360); // demi-hauteur visible à z = zEnd
      const hw = hh * camera.aspect;
      const portrait = camera.aspect < 0.85;
      layout.A = clamp(hw * (portrait ? 0.56 : 0.58), 0.5, 2.6);
      layout.B = clamp(hh * (portrait ? 0.62 : 0.5), 0.5, 1.2);
      layout.D = portrait ? 0.4 : 0.55;
      layout.dy = embed ? hh * 0.1                         // embed : centre à 45 % de la hauteur, comme le noyau de l'Orbe 2D
        : hh * (portrait ? 0.14 : 0.05);                   // remonte le centre pour laisser la place à la légende
      ringMeshes.forEach((m, i) => m.scale.set(layout.A * RINGS[i].k, layout.B * RINGS[i].k, layout.D * RINGS[i].k));
      inner.position.y = layout.dy;
      renderOnce();
    }

    /* ----- Boucle de rendu (rAF) : micro-rotation permanente, orbites, halos ----- */
    const tmpV = new THREE.Vector3();
    let raf = 0, last = 0, tAcc = 0, visible = true, dirty = true;

    function applyState(dt) {
      // caméra
      camera.position.z = S.camZ;
      if (Math.abs(camera.fov - S.fov) > 1e-3) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
      // enveloppe : rotation lente + un peu de scroll ; scale (évasement) ; opacité
      shell.rotation.y = tAcc * 0.05 + S.progress * 1.1;
      shell.rotation.x = tAcc * 0.021 + S.progress * 0.35;
      shell.scale.setScalar(S.shellScale);
      shellMat.opacity = S.shellAlpha;
      shell.visible = S.shellAlpha > 0.004;
      // groupe interne
      const a = S.innerAlpha;
      inner.visible = a > 0.002;
      if (!inner.visible) return;
      if (embed) inner.position.y = layout.dy * camera.position.z / cfg.camera.zEnd;   // centre constant en pixels malgré le recul de la caméra
      inner.scale.setScalar(Math.max(0.01, S.innerScale));
      for (const f of fade) f.mat.opacity = f.base * a;
      // micro-rotation permanente (oscillation lente : les labels restent lisibles et dans le cadre)
      inner.rotation.y = Math.sin(tAcc * 0.21) * 0.16 + tAcc * 0.0;
      inner.rotation.x = Math.sin(tAcc * 0.17 + 1.3) * 0.07;
      inner.rotation.z = Math.sin(tAcc * 0.11 + 0.4) * 0.03;
      const breathe = 1 + 0.06 * Math.sin(tAcc * 1.7);
      haloA.scale.setScalar(1.1 * breathe);
      haloB.scale.setScalar(2.9 * (1 + 0.04 * Math.sin(tAcc * 1.1 + 1)));
      // satellites en orbite + liaisons
      for (let i = 0; i < sats.length; i++) {
        const s = sats[i], r = RINGS[s.ring];
        const th = s.theta0 + tAcc * r.speed;
        const x = Math.cos(th) * layout.A * r.k;
        const y = Math.sin(th) * layout.B * r.k + Math.sin(tAcc * 0.6 + s.wob) * 0.05;
        const z = Math.sin(th) * layout.D * r.k;
        s.obj.position.set(x, y, z);
        const p = s.geo.attributes.position;
        p.setXYZ(0, 0, 0, 0); p.setXYZ(1, x, y, z); p.needsUpdate = true;
        s.dashed.computeLineDistances();
        // impulsion qui remonte la liaison (0 -> 1)
        const u = (tAcc * 0.22 + s.pulsePhase) % 1;
        pulsePos[i * 3] = x * u; pulsePos[i * 3 + 1] = y * u; pulsePos[i * 3 + 2] = z * u;
        // profondeur -> légère variation d'opacité de l'étiquette (au premier plan = plus lisible)
        s.obj.getWorldPosition(tmpV);
        const depth = clamp((tmpV.z + 1) / 2, 0, 1);
        s.label.div.style.opacity = (a * (0.62 + 0.38 * depth)).toFixed(3);
      }
      pulseGeo.attributes.position.needsUpdate = true;
      linkDashMat.dashOffset = -tAcc * 0.35;
      coreLabel.div.style.opacity = a.toFixed(3);
    }

    function draw() {
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    function renderOnce() { applyState(0); draw(); dirty = false; }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now; tAcc += dt;
      applyState(dt); draw();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !isStatic && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    // Pause hors écran + onglet caché
    // (embed : l'activité est pilotée de l'extérieur par setActive(), pas par l'IntersectionObserver)
    const io = embed ? null : new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      visible ? start() : stop();
    }, { rootMargin: '10% 0px' });
    if (io) io.observe(root);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);

    // Resize propre (le sticky est en svh : pas de redimensionnement parasite quand la barre d'URL mobile bouge)
    const ro = new ResizeObserver(() => resize());
    ro.observe(els.sticky);

    // Perte de contexte WebGL
    const onLost = (e) => { e.preventDefault(); stop(); };
    const onRestored = () => { start(); renderOnce(); };
    els.canvas.addEventListener('webglcontextlost', onLost);
    els.canvas.addEventListener('webglcontextrestored', onRestored);

    /* ----- Timeline GSAP + ScrollTrigger (mode animé) ----- */
    let tl = null;
    if (!isStatic && !embed) {
      gsap.registerPlugin(ScrollTrigger);
      const cam = cfg.camera, op = cfg.envelopeOpacity;
      const cap = els.caps;
      gsap.set(cap[0], { autoAlpha: 1, y: 0 });
      gsap.set([cap[1], cap[2]], { autoAlpha: 0, y: 14 });
      const topOffset = parseFloat(getComputedStyle(root).getPropertyValue('--oai-top')) || 0;

      tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: `top top+=${topOffset}`,   // le sticky se fige
          end: 'bottom bottom',             // …jusqu'à la fin de la section (≈ 280vh de scroll pour 380vh)
          scrub: cfg.scrub,                 // scrub:1 -> 1 s de lissage
          invalidateOnRefresh: true
        },
        onUpdate: () => { dirty = true; }
      });
      // Progression globale (rotation de l'enveloppe, barre)
      tl.to(S, { progress: 1, duration: 1 }, 0);
      if (els.bar) tl.to(els.bar, { scaleX: 1, duration: 1 }, 0);
      if (els.cue) tl.to(els.cue, { autoAlpha: 0, duration: 0.06 }, 0);
      // Phase 1 : dérive lente de la caméra
      tl.to(S, { camZ: cam.zApproach, duration: 0.22, ease: 'sine.inOut' }, 0);
      // Phase 2 : plongée jusqu'à z=4 ; la membrane (r=6) est franchie vers 0.49
      tl.to(S, { camZ: cam.zEnd, duration: 0.40, ease: 'power2.inOut' }, 0.22);
      tl.to(S, { fov: cam.fov + 9, duration: 0.16, ease: 'sine.in' }, 0.30);      // légère sensation de vitesse…
      tl.to(S, { fov: cam.fov, duration: 0.22, ease: 'sine.out' }, 0.46);         // …puis retour au champ normal
      // Estompe de la membrane (avant contact) puis évasement (juste après la traversée)
      tl.to(S, { shellAlpha: op.to, duration: 0.26, ease: 'sine.inOut' }, 0.36);
      tl.to(S, { shellScale: cfg.envelopeFlare, duration: 0.24, ease: 'power2.out' }, 0.46);
      // Phase 3 : le groupe interne naît (scale 0.01 -> 1, alpha 0 -> 1)
      tl.to(S, { innerScale: 1, duration: 0.30, ease: 'power3.out' }, 0.50);
      tl.to(S, { innerAlpha: 1, duration: 0.24, ease: 'sine.inOut' }, 0.52);
      // Légendes
      tl.to(cap[0], { autoAlpha: 0, y: -14, duration: 0.06 }, 0.18);
      tl.fromTo(cap[1], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.06 }, 0.30);
      tl.to(cap[1], { autoAlpha: 0, y: -14, duration: 0.06 }, 0.52);
      tl.fromTo(cap[2], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.76);
    } else if (embed) {
      // embed : état piloté de l'extérieur (setEmbedProgress) ; l'animation continue (rAF) sauf reduced-motion
      Object.assign(S, { fov: cfg.camera.fov, shellScale: cfg.envelopeFlare, progress: 0.6 });
      tAcc = 0;
      applyEmbed(embedU, true);
    } else {
      // reduced-motion : image unique, état final (phase 3 lisible), enveloppe très discrète, aucune animation
      Object.assign(S, {
        camZ: cfg.camera.zEnd, fov: cfg.camera.fov, shellScale: 1.4, shellAlpha: 0.14,
        innerScale: 1, innerAlpha: 1, progress: 0.6
      });
      tAcc = 0;
    }

    /** embed : u 0 -> 1 = caméra z 5 -> 4 (zEnd), noyau/satellites qui apparaissent, enveloppe très discrète. */
    function applyEmbed(u, silent) {
      u = clamp(u, 0, 1);
      const e = clamp(u / 0.45, 0, 1), k = e * e * (3 - 2 * e);
      S.camZ = cfg.camera.zEnd + (1 - u) * 1.0;
      S.innerAlpha = k; S.innerScale = 0.55 + 0.45 * k;
      S.shellAlpha = cfg.envelopeOpacity.to * k; S.progress = 0.6;    // même état final que la phase 3 du scroll
      if (!silent && (isStatic || !raf)) renderOnce();
    }

    resize();      // 1er rendu + dimensionnement
    start();

    return {
      setLabelsText,
      setEmbedProgress: (u) => applyEmbed(u),
      setActive: (on) => { visible = !!on; if (visible) { start(); renderOnce(); } else stop(); },
      getState: () => ({ ...S, camZ: camera.position.z, mode: isStatic ? 'static' : 'live' }),
      refresh: () => { if (!isStatic && !embed) ScrollTrigger.refresh(); resize(); },
      dispose() {
        stop();
        if (io) io.disconnect();
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        els.canvas.removeEventListener('webglcontextlost', onLost);
        els.canvas.removeEventListener('webglcontextrestored', onRestored);
        if (tl) {
          if (tl.scrollTrigger) tl.scrollTrigger.kill();
          tl.kill();
          gsap.set([els.caps, els.cue, els.bar].flat().filter(Boolean), { clearProps: 'all' });
        }
        disposables.forEach((d) => d.dispose && d.dispose());
        scene.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); });
        sats.forEach((s) => s.label.div.remove());
        coreLabel.div.remove();
        labelRenderer.domElement.remove();
        renderer.dispose();
        renderer.forceContextLoss();
      }
    };
  }

  /* ---------- API publique ---------- */
  return {
    setEmbedProgress(u) { embedU = u; if (api && api.setEmbedProgress) api.setEmbedProgress(u); },
    isReady() { return !!api; },
    setActive(on) { api && api.setActive && api.setActive(on); },
    refresh() { api && api.refresh(); },
    getState() { return api ? api.getState() : { mode: 'loading' }; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cleanups.forEach((fn) => fn());
      if (api) { api.dispose(); api = null; }
      root.classList.remove('is-live', 'is-ready', 'is-nogl');
    }
  };
}

/* Auto-init : <section data-oai-scrolly data-oai-auto> est initialisée toute seule. */
if (typeof document !== 'undefined') {
  const auto = () => document.querySelectorAll('[data-oai-scrolly][data-oai-auto]').forEach((el) => {
    if (!el.__oai) el.__oai = init(el);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
}
