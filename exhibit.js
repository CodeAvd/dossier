// Exhibit 01 — Evidence → Verdict.
// An audited agent re-reads a case: evidence nodes are retrieved and lock into
// place (easeOutCubic, no bounce), hairline edges cite each source to the claim,
// then the claim flips PENDING → VERDICT and a single vermilion ring ignites —
// the one bloom beat. Orthographic / axonometric (no perspective hero), FogExp2
// for depth, near-zero motion otherwise. WebGPU with automatic WebGL2 fallback;
// prefers-reduced-motion freezes to one labelled verdict frame.
import * as THREE from 'three/webgpu';
import { PAL, tokenMaterial, verdictMaterial, setupPostFX } from './exhibit-fx.js';

const mount = document.getElementById('exhibit01');
const elRetr = document.querySelector('[data-retrieved]');
const elCited = document.querySelector('[data-cited]');
const elVerdict = document.querySelector('[data-verdict]');
const elStatus = document.querySelector('[data-closure]');

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIEW = 3.0;
const FOG = 0.085;

let renderer, scene, cam, fx, raf = 0, running = true, last = 0;
let claim, ring, ringIgnite, edgeMat;
let evid = [];                       // { mesh, edge, from, target }
let caseClock = 0, caseIndex = 0;

const camTarget = new THREE.Vector3(0, 0.65, 0);
const camBase = new THREE.Vector3(3.4, 2.25, 6.8);
const camOff = new THREE.Vector2(0, 0), camOffTgt = new THREE.Vector2(0, 0);

// per-case timeline (seconds)
const TL = { ret0: 1.0, per: 0.85, ease: 0.75, verdictAt: 4.7, verdictEase: 0.6, hold: 2.4, fade: 0.8 };
const CASE_LEN = TL.verdictAt + TL.verdictEase + TL.hold + TL.fade;   // ≈ 8.5s

const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);   // easeOutCubic
const rnd = (a, b) => a + Math.random() * (b - a);

// reusable temporaries
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _mid = new THREE.Vector3();

// orient a unit cylinder (height along +Y) to span `frac` of the way from a→b
function placeEdge(mesh, a, b, frac) {
  _dir.subVectors(b, a);
  const full = _dir.length();
  const len = Math.max(full * frac, 1e-4);
  _mid.copy(a).addScaledVector(_dir, frac * 0.5);
  mesh.position.copy(_mid);
  mesh.quaternion.setFromUnitVectors(_up, _dir.clone().normalize());
  mesh.scale.set(1, len, 1);
}

// evidence target layout for a case — first case deterministic & symmetric
function layoutTargets(idx) {
  if (idx === 0) {
    return [
      new THREE.Vector3(-1.85, 0.20, 0.45),
      new THREE.Vector3(0.05, -0.05, -0.35),
      new THREE.Vector3(1.80, 0.28, 0.40),
    ];
  }
  const n = Math.random() < 0.5 ? 2 : 3;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * rnd(1.5, 2.0) + rnd(-0.2, 0.2);
    out.push(new THREE.Vector3(x, rnd(-0.1, 0.35), rnd(-0.4, 0.5)));
  }
  return out;
}

function buildCase(idx) {
  // dispose old evidence + edges
  for (const e of evid) { scene.remove(e.mesh, e.edge); e.mesh.geometry.dispose(); }
  evid = [];
  const targets = layoutTargets(idx);
  const sphere = new THREE.SphereGeometry(0.18, 28, 18);
  const cyl = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);
  for (const target of targets) {
    const mesh = new THREE.Mesh(sphere, tokenMaterial(PAL.nodeFill));
    mesh.frustumCulled = false;
    const from = target.clone().multiplyScalar(1.18); from.y -= 0.25;  // slide in from outside
    mesh.position.copy(from); mesh.scale.setScalar(1e-4);
    const edge = new THREE.Mesh(cyl, edgeMat);
    edge.frustumCulled = false; edge.visible = false;
    scene.add(mesh, edge);
    evid.push({ mesh, edge, from, target });
  }
}

function setHUD(retrieved, verdict) {
  if (elRetr) elRetr.textContent = String(retrieved);
  if (elCited) elCited.textContent = String(retrieved);
  if (elVerdict) elVerdict.textContent = verdict ? 'VERDICT' : 'PENDING';
  if (elStatus) {
    elStatus.textContent = verdict ? '⟶ VERDICT · EVIDENCE CITED' : '— retrieving evidence —';
    elStatus.classList.toggle('live', verdict);
  }
}

function step() {
  let retrieved = 0;
  for (let i = 0; i < evid.length; i++) {
    const e = evid[i];
    const t = ease((caseClock - (TL.ret0 + i * TL.per)) / TL.ease);
    e.mesh.scale.setScalar(Math.max(t, 1e-4));
    e.mesh.position.lerpVectors(e.from, e.target, t);
    placeEdge(e.edge, claim.position, e.mesh.position, t);
    e.edge.visible = t > 0.02;
    if (t > 0.6) retrieved++;
  }
  let vt = ease((caseClock - TL.verdictAt) / TL.verdictEase);
  if (caseClock > CASE_LEN - TL.fade) vt *= Math.max(0, (CASE_LEN - caseClock) / TL.fade);
  ringIgnite.value = vt;
  ring.visible = vt > 0.02;
  ring.scale.setScalar(0.55 + 0.45 * ease((caseClock - TL.verdictAt) / TL.verdictEase));
  claim.scale.setScalar(1 + 0.06 * vt);
  setHUD(retrieved, vt > 0.5);
}

function applyCam() {
  cam.position.set(camBase.x + camOff.x, camBase.y + camOff.y, camBase.z);
  cam.lookAt(camTarget);
}

function resize() {
  const w = mount.clientWidth, h = mount.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  const a = w / h;
  cam.left = -VIEW * a; cam.right = VIEW * a; cam.top = VIEW; cam.bottom = -VIEW;
  cam.updateProjectionMatrix();
  if (reduce) fx.render();
}

async function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!running) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  caseClock += dt;
  if (caseClock >= CASE_LEN) { caseClock = 0; buildCase(++caseIndex); }
  camOff.lerp(camOffTgt, 0.06); applyCam();
  step();
  await fx.render();
}

async function init() {
  const w = mount.clientWidth || 800, h = mount.clientHeight || 640;
  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(PAL.ink, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  await renderer.init();
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.ink);
  scene.fog = new THREE.FogExp2(PAL.ink, FOG);

  const a = w / h;
  cam = new THREE.OrthographicCamera(-VIEW * a, VIEW * a, VIEW, -VIEW, 0.1, 100);
  applyCam();

  edgeMat = tokenMaterial(PAL.nodeFill, PAL.paper, 0.35);

  // claim node (top) — slightly larger + brighter than evidence
  claim = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 20), tokenMaterial(PAL.claimFill, PAL.paper, 0.4));
  claim.position.set(0, 1.7, 0); claim.frustumCulled = false;
  scene.add(claim);

  // verdict ring — the sole bloom object
  const vm = verdictMaterial(); ringIgnite = vm.ignite;
  ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 16, 64), vm.material);
  ring.position.copy(claim.position); ring.frustumCulled = false; ring.visible = false;
  scene.add(ring);

  buildCase(0);

  fx = setupPostFX(renderer, scene, cam);
  addEventListener('resize', resize, { passive: true });

  if (reduce) {                       // one static, legible verdict frame
    caseClock = TL.verdictAt + TL.verdictEase + 0.1; step(); await fx.render();
    return;
  }

  mount.addEventListener('pointermove', (e) => {
    const r = mount.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    camOffTgt.set(nx * 0.5, -ny * 0.38);
  }, { passive: true });
  mount.addEventListener('pointerleave', () => camOffTgt.set(0, 0), { passive: true });

  const io = new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0.05 });
  io.observe(mount);
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function seedFail() {
  mount.classList.add('no-webgl');
  if (elRetr) elRetr.textContent = '3';
  if (elCited) elCited.textContent = '3';
  if (elVerdict) elVerdict.textContent = 'VERDICT';
  if (elStatus) elStatus.textContent = '— static frame —';
}

if (mount) {
  init().catch((err) => { console.error(err); seedFail(); });
}
