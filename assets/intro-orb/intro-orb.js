/* =====================================================================
   Pascal Robotics — séquence d'ouverture « GROS ORBE » (index.html)
   ES module — Three.js r186 local (assets/vendor/three-0.186.1/), aucun CDN.

   Une grande sphère géodésique wireframe très fine (IcosahedronGeometry detail élevé, arêtes dédoublonnées via
   WireframeGeometry + points aux sommets, comme l'Orbe canvas de /orchestrai) ; la caméra plonge automatiquement
   (sans scroll), traverse la membrane puis se retrouve à l'intérieur. La page hôte enchaîne ensuite sur la vidéo
   d'intro (fondu) via les callbacks.

   API : const orb = await createIntroOrb(canvas, options);   // rejette si WebGL indisponible
         orb.start();  orb.destroy();
   options : { small, onHandoff(), onFade(k 0..1), onEnd(), onFail() }
   Chronologie (ms, horloge réelle → indépendante de la fluidité) : voir T ci-dessous.
   ===================================================================== */

const VENDOR = new URL('../vendor/three-0.186.1/', import.meta.url).href;

/* Chronologie */
const T = {
  intro: 0.55,       // s : fondu d'apparition (noir -> orbe) + lente dérive
  diveStart: 0.45,   // s : début de la plongée
  diveEnd: 4.75,     // s : fin de la plongée (caméra au cœur)
  handoff: 4.25,     // s : la vidéo démarre (sous la couche orbe)
  fade: 1.05,        // s : fondu orbe -> vidéo
};
T.end = T.handoff + T.fade;

const R = 6;                       // rayon de l'orbe (unités scène)
const FIT = 0.9;                   // l'orbe occupe ~90 % de la plus petite dimension de l'écran au départ
const C_END = 0.6;                 // position finale de la caméra (à l'intérieur)

/* Finesse du maillage : detail = nb de sous-divisions par arête de l'icosaèdre (-> 10(d+1)²+2 sommets).
   Orbe canvas de /orchestrai : ~270 pts (desktop) / 150 pts (mobile), pas moyen ~45 px (desktop) / ~35 px (mobile).
   Ici, au départ : desktop (R écran ≈ 400 px) detail 14 -> 2 252 sommets, pas ≈ 30 px ; mobile (R ≈ 175 px) detail 8 -> 812 sommets, pas ≈ 22 px
   => maillage plus fin que l'Orbe canvas, à l'échelle plein écran. */
export const DETAIL = { desktop: 14, mobile: 8 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const VERT_LINE = /* glsl */`
  uniform float uNear; uniform float uFar; uniform float uPx;
  varying float vT; varying float vD;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = length(mv.xyz);
    vD = d;
    vT = clamp((d - uNear) / max(uFar - uNear, 2.5), 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uPx * 15.0 / max(d, 0.5), 1.0 * uPx, 4.2 * uPx);
  }`;
const FRAG_LINE = /* glsl */`
  uniform vec3 uColNear; uniform vec3 uColFar; uniform float uAlpha; uniform float uMax; uniform float uMin;
  varying float vT; varying float vD;
  void main(){
    float a = uAlpha * mix(uMax, uMin, vT) * smoothstep(0.05, 1.1, vD);
    gl_FragColor = vec4(mix(uColNear, uColFar, vT), a);
  }`;
const FRAG_PT = /* glsl */`
  uniform vec3 uColNear; uniform vec3 uColFar; uniform float uAlpha; uniform float uMax; uniform float uMin;
  varying float vT; varying float vD;
  void main(){
    vec2 c = gl_PointCoord - 0.5; float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, r);
    float a = uAlpha * mix(uMax, uMin, vT) * soft * smoothstep(0.05, 1.1, vD);
    gl_FragColor = vec4(mix(vec3(0.84,0.90,1.0), uColFar, vT * 0.6), a);
  }`;

export async function createIntroOrb(canvas, options = {}) {
  const small = !!options.small;
  const [THREE] = await Promise.all([import(VENDOR + 'three.module.min.js')]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 120);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const detail = small ? DETAIL.mobile : DETAIL.desktop;
  const ico = track(new THREE.IcosahedronGeometry(R, detail));
  const wire = track(new THREE.WireframeGeometry(ico));   // arêtes dédoublonnées

  const uni = (alpha, max, min, px) => ({
    uNear: { value: 0 }, uFar: { value: 12 }, uPx: { value: px || 1 },
    uColNear: { value: new THREE.Color(0x7fb2ff) }, uColFar: { value: new THREE.Color(0x3d8bff) },
    uAlpha: { value: alpha }, uMax: { value: max }, uMin: { value: min }
  });
  const mk = (frag, u) => track(new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT_LINE, fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
  }));

  const uLines = uni(1, 0.62, 0.11);
  const lines = new THREE.LineSegments(wire, mk(FRAG_LINE, uLines));

  // sommets uniques -> points (comme les points de l'Orbe canvas)
  const pos = ico.getAttribute('position'); const seen = new Set(); const vtx = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 500) + '_' + Math.round(y * 500) + '_' + Math.round(z * 500);
    if (!seen.has(k)) { seen.add(k); vtx.push(x, y, z); }
  }
  const ptGeo = track(new THREE.BufferGeometry());
  ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(vtx, 3));
  const uPts = uni(1, 0.85, 0.16, pixelRatio);
  const points = new THREE.Points(ptGeo, mk(FRAG_PT, uPts));

  // quelques points « noyau » à l'intérieur (comme l'Orbe : ~20 % de points internes) -> parallaxe une fois dedans
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const nDust = small ? 170 : 300; const dust = [];
  for (let i = 0; i < nDust; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = R * (0.35 + rnd() * 0.6);
    dust.push(Math.cos(th) * s * rr, u * rr, Math.sin(th) * s * rr);
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  const uDust = uni(0.8, 0.7, 0.2, pixelRatio);
  const dustPts = new THREE.Points(dustGeo, mk(FRAG_PT, uDust));

  const group = new THREE.Group();
  group.add(lines, points, dustPts);
  group.rotation.x = 0.38;                 // même inclinaison que l'Orbe canvas
  scene.add(group);

  let raf = 0, t0 = 0, running = false, handed = false, ended = false, failed = false;
  const W = { w: 0, h: 0 };
  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth), h = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (w === W.w && h === W.h) return;
    W.w = w; W.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }
  const onLost = (e) => { e.preventDefault(); if (!ended) { failed = true; options.onFail && options.onFail(); } };
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('resize', resize);

  function d0For(fov, aspect) {
    const t = Math.tan((fov * Math.PI) / 360) * Math.min(1, aspect);
    return R * Math.sqrt(1 + 1 / Math.pow(FIT * t, 2));
  }

  function render(ts) {
    raf = 0;
    if (!running) return;
    const t = (ts - t0) / 1000;
    resize();

    const baseFov = 50;
    const d0 = d0For(baseFov, camera.aspect);
    const p = easeInOutCubic(clamp((t - T.diveStart) / (T.diveEnd - T.diveStart), 0, 1));
    const drift = 0.5 * smooth(0, T.intro + 2, t);                 // dérive lente avant la plongée
    const c = d0 - drift * 0.4 - (d0 - drift * 0.4 - C_END) * p;    // distance caméra -> centre
    camera.fov = baseFov + 34 * smooth(0.28, 0.85, p);             // champ qui s'ouvre : sensation de vitesse
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(t * 0.7) * 0.12 * (1 - p), Math.cos(t * 0.55) * 0.08 * (1 - p), c);
    camera.rotation.set(0, 0, 0.05 * smooth(0.2, 1, p) * Math.sin(t * 0.4 + 1));
    group.rotation.y = t * 0.22 + 0.4;                              // rotation calme (Orbe : ~0.2 rad/s)

    const near = Math.abs(c - R), far = c + R;
    for (const u of [uLines, uPts, uDust]) { u.uNear.value = near; u.uFar.value = far; }
    const fadeIn = smooth(0, T.intro, t);
    uLines.uAlpha.value = uPts.uAlpha.value = uDust.uAlpha.value = fadeIn;

    renderer.render(scene, camera);

    // flash lumineux discret à la traversée de la membrane (c ≈ R)
    if (options.onFlash) options.onFlash(Math.exp(-Math.pow((c - R) / 1.1, 2)) * 0.5 * fadeIn);

    if (!handed && t >= T.handoff) { handed = true; options.onHandoff && options.onHandoff(); }
    if (t >= T.handoff) options.onFade && options.onFade(clamp((t - T.handoff) / T.fade, 0, 1));
    if (t >= T.end) { ended = true; options.onEnd && options.onEnd(); return; }
    raf = requestAnimationFrame(render);
  }

  return {
    timeline: T,
    detail,
    vertexCount: vtx.length / 3,
    start() {
      if (running || failed) return;
      running = true; resize();
      raf = requestAnimationFrame((ts) => { t0 = ts; render(ts); });
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      disposables.forEach((o) => o.dispose && o.dispose());
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    }
  };
}
