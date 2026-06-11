// Exhibit 01 — Cross-Market Spread, Depth & Closure · "Volumetric Depth".
// Orthographic/axonometric (NO perspective hero). Two facing cumulative-depth
// books (Polymarket × Kalshi) rendered as displaced depth MANIFOLDS, with the
// exact staircase ladders + mono HUD kept legible ON TOP. Atmosphere via FogExp2
// (the far book recedes into ink), not glow. The sole glow is a SELECTIVE-bloom
// vermilion closure arc on the ~1-in-6 cross — one eased wow beat, then fade.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { makeManifoldMaterial, feedManifold, setupBloom, BLOOM_LAYER } from './exhibit-fx.js';

const mount = document.getElementById('exhibit01');
const elBid = document.querySelector('[data-bid]');
const elAsk = document.querySelector('[data-ask]');
const elSpread = document.querySelector('[data-spread]');
const elClosure = document.querySelector('[data-closure]');

const C = {
  ink: 0x161210, paper: 0xede4d3, muted: 0x8a7f6e,
  accent: 0xd6452b, bid: 0x4c7a5e, ask: 0xb0553f,
  bidFill: 0x355446, askFill: 0x66372a,  // crown tints — low saturation, near-ink
};

const LEVELS = 7;        // price levels per side
const STEP = 0.62;       // price-axis spacing between levels (world units)
const ZS = 1.15;         // book separation along z (depth)
const ZHALF = 0.42;      // manifold slab half-width along z
const MAXY = 2.7;        // cumulative-depth ceiling
const SETTLE = 0.62;     // seconds per re-quote settle
const QUOTE_EVERY = 2.6; // seconds between re-quotes
const FOG_DESK = 0.108;  // FogExp2 density — desktop (primary depth-focus device)
const FOG_MOB = 0.05;    // lighter on mobile
const PULSE = 1.9;       // closure-arc bloom strength at full cross
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mobile = matchMedia('(max-width: 720px)').matches;

let renderer, scene, cam, fx, raf = 0, running = true, last = 0, quoteClock = 0, settleT = 1;
let bidLine, askLine, closureArc, bidCols, askCols, grid, bidManifold, askManifold;
let lineMats = [];
const tmp = new THREE.Object3D();
const camTarget = new THREE.Vector3(0, 1.18, 0);
const camBase = new THREE.Vector3(3.8, 2.5, 6.8);
const camOff = new THREE.Vector2(0, 0), camOffTgt = new THREE.Vector2(0, 0);
const _dir = new THREE.Vector3();
let arcOpacity = 0, wasLive = true;   // first frame runs full fx.render() to prime/clear the bloom RT

// book state
const book = {
  bid: { cur: [], tgt: [], bestPrice: 0.61, tgtBestPrice: 0.61 },
  ask: { cur: [], tgt: [], bestPrice: 0.614, tgtBestPrice: 0.614 },
  closeAmt: 0, tgtClose: 0,
};

function rnd(a, b) { return a + Math.random() * (b - a); }

function quote() {
  const cross = Math.random() < 0.17;        // ~1 in 6 venues cross (arbitrage closure)
  const mid = rnd(0.55, 0.67);
  const spr = cross ? -rnd(0.0008, 0.004) : rnd(0.001, 0.006);
  book.bid.tgtBestPrice = mid - spr / 2;
  book.ask.tgtBestPrice = mid + spr / 2;
  for (const side of ['bid', 'ask']) {
    const arr = []; let cum = 0;
    for (let i = 0; i < LEVELS; i++) { cum += rnd(0.18, 0.62) * (1 - i / (LEVELS + 2)); arr.push(Math.min(cum, MAXY)); }
    book[side].tgt = arr;
    if (book[side].cur.length === 0) book[side].cur = arr.slice();
    book[side].start = book[side].cur.slice();
    book[side].startBest = book[side].bestPrice;
  }
  book.tgtClose = cross ? 1 : 0;
  book.startClose = book.closeAmt;
  settleT = 0;
}

const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic — no bounce

function priceToX(side, i) {
  const dir = side === 'bid' ? -1 : 1;
  const half = (book.ask.bestPrice - book.bid.bestPrice) / 2;
  const offWorld = (half / 0.006) * 0.9;
  return dir * offWorld + dir * i * STEP;
}

// staircase ladder — flat point array into a Line2 LineGeometry (mutated in place)
function buildStaircase(side, line) {
  const z = side === 'bid' ? ZS : -ZS;
  const cur = book[side].cur;
  const pts = [];
  let x = priceToX(side, 0);
  pts.push(x, 0, z);
  for (let i = 0; i < LEVELS; i++) {
    pts.push(x, cur[i], z);
    const nx = priceToX(side, i + 1);
    pts.push(nx, cur[i], z);
    x = nx;
  }
  line.geometry.setPositions(pts);
}

// feed the eased depth profile into a manifold's uniform arrays
function buildManifold(side, mat) {
  const cur = book[side].cur;
  const depth = [], xs = [];
  for (let i = 0; i < LEVELS; i++) { depth.push(cur[i]); xs.push(priceToX(side, i)); }
  feedManifold(mat, depth, xs);
}

function updateColumns(side, mesh) {
  const z = side === 'bid' ? ZS : -ZS;
  const cur = book[side].cur;
  const w = 0.21, d = 0.4;
  for (let i = 0; i < LEVELS; i++) {
    const h = Math.max(cur[i], 0.001);
    const x = priceToX(side, i) + (side === 'bid' ? -STEP / 2 : STEP / 2);
    tmp.position.set(x, h / 2, z);
    tmp.scale.set(w, h, d);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// vermilion closure arc — quadratic bezier bid → apex → ask, sampled into Line2
function updateClosure() {
  const a = book.closeAmt;
  arcOpacity = a * (book.bid.bestPrice >= book.ask.bestPrice ? 1 : 0);
  const bx = priceToX('bid', 0), ax = priceToX('ask', 0);
  const y0 = Math.min(book.bid.cur[0] || 0.4, book.ask.cur[0] || 0.4) * 0.7 + 0.2;
  const apexY = Math.max(book.bid.cur[0] || 0.4, book.ask.cur[0] || 0.4) + 1.05;
  const p0 = new THREE.Vector3(bx, y0, ZS);
  const p1 = new THREE.Vector3((bx + ax) / 2, apexY, 0);
  const p2 = new THREE.Vector3(ax, y0, -ZS);
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
  const pts = curve.getPoints(46);
  const flat = [];
  for (const p of pts) flat.push(p.x, p.y, p.z);
  closureArc.geometry.setPositions(flat);
  closureArc.material.opacity = arcOpacity;
  closureArc.visible = arcOpacity > 0.002;
  if (fx) fx.bloomPass.strength = arcOpacity * PULSE;
}

function refreshHUD() {
  const b = book.bid.bestPrice, a = book.ask.bestPrice;
  const bps = Math.round((a - b) * 10000);
  if (elBid) elBid.textContent = b.toFixed(4);
  if (elAsk) elAsk.textContent = a.toFixed(4);
  if (elSpread) elSpread.textContent = (bps >= 0 ? bps : 0).toString().padStart(2, '0');
  if (elClosure) {
    const crossed = b >= a;
    elClosure.textContent = crossed ? '⟶ ARBITRAGE · SPREAD CLOSED' : '— monitoring spread —';
    elClosure.classList.toggle('live', crossed);
  }
}

function setupCamera(w, h) {
  const aspect = w / h, view = 3.35;
  cam = new THREE.OrthographicCamera(-view * aspect, view * aspect, view, -view, 0.1, 100);
  applyCamera();
}
function applyCamera() {
  cam.position.set(camBase.x + camOff.x, camBase.y + camOff.y, camBase.z);
  cam.lookAt(camTarget);
  cam.getWorldDirection(_dir);
  if (bidManifold) bidManifold.material.uniforms.uCamDir.value.copy(_dir);
  if (askManifold) askManifold.material.uniforms.uCamDir.value.copy(_dir);
}

function setMode(m) {
  mobile = m;
  const dens = m ? FOG_MOB : FOG_DESK;
  if (scene.fog) scene.fog.density = dens;
  for (const mat of [bidManifold && bidManifold.material, askManifold && askManifold.material]) {
    if (mat) mat.uniforms.uFogDensity.value = dens;
  }
  if (bidManifold) { bidManifold.visible = !m; askManifold.visible = !m; }
  if (bidCols) { bidCols.visible = m; askCols.visible = m; updateColumns('bid', bidCols); updateColumns('ask', askCols); }
}

function resize() {
  const w = mount.clientWidth, h = mount.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(dpr);
  const aspect = w / h, view = 3.35;
  cam.left = -view * aspect; cam.right = view * aspect; cam.top = view; cam.bottom = -view;
  cam.updateProjectionMatrix();
  if (fx) fx.setSize(w, h, dpr);
  const res = new THREE.Vector2(w * dpr, h * dpr);
  for (const lm of lineMats) lm.resolution.copy(res);
  const m = matchMedia('(max-width: 720px)').matches;
  if (m !== mobile) setMode(m);
  if (reduce && scene) renderScene();   // static frame: keep it crisp across container resizes
}

function settleStep(dt) {
  settleT = Math.min(settleT + dt / SETTLE, 1);
  const e = ease(settleT);
  for (const side of ['bid', 'ask']) {
    const s = book[side];
    for (let i = 0; i < LEVELS; i++) s.cur[i] = s.start[i] + (s.tgt[i] - s.start[i]) * e;
    s.bestPrice = s.startBest + (s.tgtBestPrice - s.startBest) * e;
  }
  book.closeAmt = book.startClose + (book.tgtClose - book.startClose) * e;
  buildStaircase('bid', bidLine); buildStaircase('ask', askLine);
  buildManifold('bid', bidManifold.material); buildManifold('ask', askManifold.material);
  if (mobile) { updateColumns('bid', bidCols); updateColumns('ask', askCols); }
  updateClosure(); refreshHUD();
}

function renderScene() {
  // parallax: lerp the ortho camera offset toward the cursor (frustum unchanged)
  if (!mobile && !reduce) {
    camOff.lerp(camOffTgt, 0.06);
    applyCamera();
  }
  const live = arcOpacity > 0.002;
  if (mobile) {
    cam.layers.set(0);
    renderer.render(scene, cam);
  } else if (live || wasLive) {
    fx.render();           // two-composer selective bloom (also clears RT on live→dead)
  } else {
    fx.finalRender();      // cheap: scene + (black) bloom composite
  }
  wasLive = live;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!running) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  quoteClock += dt;
  if (quoteClock >= QUOTE_EVERY && !reduce) { quoteClock = 0; quote(); }
  if (settleT < 1) {
    settleStep(dt);
  } else if (book.tgtClose === 1) {
    book.closeAmt = Math.max(book.closeAmt - dt * 0.6, 0.0);   // fade the closure out
    updateClosure();
  }
  renderScene();
}

function mkFatLine(color, width, bloom) {
  const geo = new LineGeometry();
  geo.setPositions([0, 0, 0, 0, 0, 0]);
  const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity: bloom ? 0 : 0.94, dashed: false });
  mat.depthTest = !bloom;     // ladders sit on top of the surface; arc lives in the open channel
  mat.depthWrite = false;
  lineMats.push(mat);
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

function seedHUD(text) {
  if (elBid) elBid.textContent = '0.6120';
  if (elAsk) elAsk.textContent = '0.6160';
  if (elSpread) elSpread.textContent = '40';
  if (elClosure) elClosure.textContent = text;
}

function init() {
  const w = mount.clientWidth || 800, h = mount.clientHeight || 450;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    mount.classList.add('no-webgl');
    seedHUD('— static frame —');
    return;
  }
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(C.ink, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ink);          // opaque target for postprocessing
  scene.fog = new THREE.FogExp2(C.ink, mobile ? FOG_MOB : FOG_DESK);
  setupCamera(w, h);

  // faint price grid (taupe) — fogged for free by scene.fog
  const gpts = [];
  for (let gx = -4; gx <= 4; gx++) gpts.push(gx * 0.8, 0, ZS + 0.2, gx * 0.8, MAXY, ZS + 0.2);
  gpts.push(-4, 0, ZS + 0.2, 4, 0, ZS + 0.2);
  gpts.push(-4, 0, -ZS - 0.2, 4, 0, -ZS - 0.2);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
  grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: C.muted, transparent: true, opacity: 0.16, fog: true }));
  scene.add(grid);

  // depth manifolds (subdivided plane, vertex-displaced, custom fresnel shader)
  const mkManifold = (side) => {
    const geo = new THREE.PlaneGeometry(1, 1, 84, 12);
    const mat = makeManifoldMaterial(
      { ink: C.ink, paper: C.paper, fill: side === 'bid' ? C.bidFill : C.askFill },
      LEVELS
    );
    mat.uniforms.uZc.value = side === 'bid' ? ZS : -ZS;
    mat.uniforms.uZHalf.value = ZHALF;
    mat.uniforms.uTopY.value = MAXY;
    mat.uniforms.uFogDensity.value = mobile ? FOG_MOB : FOG_DESK;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    return mesh;
  };
  bidManifold = mkManifold('bid'); askManifold = mkManifold('ask');
  scene.add(bidManifold, askManifold);

  // flat depth columns — mobile fallback only
  const box = new THREE.BoxGeometry(1, 1, 1);
  bidCols = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: C.bid, transparent: true, opacity: 0.5, fog: true }), LEVELS);
  askCols = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: C.ask, transparent: true, opacity: 0.5, fog: true }), LEVELS);
  bidCols.frustumCulled = false; askCols.frustumCulled = false;
  bidCols.visible = false; askCols.visible = false;
  scene.add(bidCols, askCols);

  // staircase ladders (bone) — kept legible ON TOP via Line2 fat lines, depthTest off
  bidLine = mkFatLine(C.paper, 2.0, false); askLine = mkFatLine(C.paper, 2.0, false);
  bidLine.renderOrder = 10; askLine.renderOrder = 10;
  scene.add(bidLine, askLine);

  // closure arc (vermilion) — sole bloom object
  closureArc = mkFatLine(C.accent, 3.4, true);
  closureArc.renderOrder = 6;
  closureArc.layers.enable(BLOOM_LAYER);   // visible to bloom composer; layer 0 keeps it in the base pass
  scene.add(closureArc);

  // first quote + build
  quote();
  for (const s of ['bid', 'ask']) book[s].cur = book[s].tgt.slice();
  book.bid.bestPrice = book.bid.tgtBestPrice; book.ask.bestPrice = book.ask.tgtBestPrice;
  buildStaircase('bid', bidLine); buildStaircase('ask', askLine);
  buildManifold('bid', bidManifold.material); buildManifold('ask', askManifold.material);
  updateClosure(); refreshHUD();

  // selective-bloom composer rig (desktop)
  fx = setupBloom(renderer, scene, cam, w, h, C.ink);
  fx.setSize(w, h, dpr);
  const res = new THREE.Vector2(w * dpr, h * dpr);
  for (const lm of lineMats) lm.resolution.copy(res);

  setMode(mobile);

  addEventListener('resize', resize, { passive: true });
  if (!reduce) {
    mount.addEventListener('pointermove', (e) => {
      if (mobile) return;
      const r = mount.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      camOffTgt.set(nx * 0.55, -ny * 0.4);
    }, { passive: true });
    mount.addEventListener('pointerleave', () => camOffTgt.set(0, 0), { passive: true });
  }

  if (reduce) { renderScene(); return; }   // one static labeled frame

  renderScene();   // paint an immediate first frame (no empty-canvas flash before rAF)
  const io = new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0.05 });
  io.observe(mount);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

if (mount) {
  try { init(); }
  catch (err) { console.error(err); if (!renderer) { mount.classList.add('no-webgl'); seedHUD('— static frame —'); } }
}
