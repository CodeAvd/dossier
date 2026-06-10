// Exhibit 01 — Cross-Market Spread, Depth & Closure.
// Two opposing order books (Polymarket × Kalshi, same event) as z-separated
// facing cumulative-depth ladders + flat depth columns. Orthographic/axonometric:
// NO perspective, NO bloom, NO particles. One in-place-mutated geometry, ~few draws.
import * as THREE from 'three';

const mount = document.getElementById('exhibit01');
const elBid = document.querySelector('[data-bid]');
const elAsk = document.querySelector('[data-ask]');
const elSpread = document.querySelector('[data-spread]');
const elClosure = document.querySelector('[data-closure]');

const C = {
  ink: 0x161210, paper: 0xede4d3, muted: 0x8a7f6e,
  accent: 0xd6452b, bid: 0x4c7a5e, ask: 0xb0553f,
};

const LEVELS = 7;        // price levels per side
const STEP = 0.62;       // price-axis spacing between levels (world units)
const ZS = 1.15;         // book separation along z (depth)
const MAXY = 2.7;        // cumulative-depth ceiling
const SETTLE = 0.62;     // seconds per re-quote settle
const QUOTE_EVERY = 2.6; // seconds between re-quotes
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mobile = matchMedia('(max-width: 720px)').matches;

let renderer, scene, cam, raf = 0, running = true, last = 0, quoteClock = 0, settleT = 1;
let bidLine, askLine, closure, bidCols, askCols, grid;
const tmp = new THREE.Object3D();

// book state: arrays of {x, cum} per side, plus interpolation buffers
const book = {
  bid: { cur: [], tgt: [], bestPrice: 0.61, tgtBestPrice: 0.61 },
  ask: { cur: [], tgt: [], bestPrice: 0.614, tgtBestPrice: 0.614 },
  closeAmt: 0, tgtClose: 0,
};

function rnd(a, b) { return a + Math.random() * (b - a); }

// Generate a fresh target book: cumulative depth profile + a best price.
function quote() {
  // ~1 in 6 re-quotes the two venues cross (arbitrage closure)
  const cross = Math.random() < 0.17;
  const mid = rnd(0.55, 0.67);
  // spread in price terms; negative => crossed
  const spr = cross ? -rnd(0.0008, 0.004) : rnd(0.001, 0.006);
  const bestBid = mid - spr / 2;
  const bestAsk = mid + spr / 2;
  book.bid.tgtBestPrice = bestBid;
  book.ask.tgtBestPrice = bestAsk;

  for (const side of ['bid', 'ask']) {
    const arr = [];
    let cum = 0;
    for (let i = 0; i < LEVELS; i++) {
      cum += rnd(0.18, 0.62) * (1 - i / (LEVELS + 2));
      arr.push(Math.min(cum, MAXY));
    }
    book[side].tgt = arr;
    if (book[side].cur.length === 0) book[side].cur = arr.slice();
    book[side].start = book[side].cur.slice();   // snapshot for clean eased lerp
    book[side].startBest = book[side].bestPrice;
  }
  book.tgtClose = cross ? 1 : 0;
  book.startClose = book.closeAmt;
  settleT = 0;
}

const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic — no bounce

// world price-axis x for a side's level i (mid maps to x=0)
function priceToX(side, i) {
  const dir = side === 'bid' ? -1 : 1;
  // best level sits just off mid by half the current spread, then steps outward
  const half = (book.ask.bestPrice - book.bid.bestPrice) / 2; // price units
  const offWorld = (half / 0.006) * 0.9; // scale price gap -> world
  const baseX = dir * offWorld;
  return baseX + dir * i * STEP;
}

function buildStaircase(side, geom) {
  const z = side === 'bid' ? ZS : -ZS;
  const cur = book[side].cur;
  const pts = [];
  let x = priceToX(side, 0);
  pts.push(x, 0, z);
  for (let i = 0; i < LEVELS; i++) {
    pts.push(x, cur[i], z);              // vertical step up
    const nx = priceToX(side, i + 1);
    pts.push(nx, cur[i], z);             // horizontal to next price
    x = nx;
  }
  const pos = geom.attributes.position;
  for (let i = 0; i < pts.length / 3; i++) {
    pos.setXYZ(i, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  }
  pos.needsUpdate = true;
  geom.computeBoundingSphere();
}

function updateColumns(side, mesh) {
  const z = side === 'bid' ? ZS : -ZS;
  const cur = book[side].cur;
  const w = mobile ? 0.0 : 0.21;
  const d = 0.4;
  for (let i = 0; i < LEVELS; i++) {
    const h = Math.max(cur[i], 0.001);
    const x = priceToX(side, i) + (side === 'bid' ? -STEP / 2 : STEP / 2);
    tmp.position.set(x, h / 2, z);
    tmp.scale.set(w, h, d);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = !mobile;
}

function updateClosure() {
  const a = book.closeAmt;
  const bx = priceToX('bid', 0), ax = priceToX('ask', 0);
  const y = Math.min(book.bid.cur[0] || 0.4, book.ask.cur[0] || 0.4) * 0.7 + 0.2;
  const pos = closure.geometry.attributes.position;
  pos.setXYZ(0, bx, y, ZS);
  pos.setXYZ(1, ax, y, -ZS);
  pos.needsUpdate = true;
  closure.material.opacity = a * (book.bid.bestPrice >= book.ask.bestPrice ? 1 : 0);
  closure.visible = closure.material.opacity > 0.01;
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
  const aspect = w / h;
  const view = 3.35; // vertical half-extent in world units
  cam = new THREE.OrthographicCamera(-view * aspect, view * aspect, view, -view, 0.1, 100);
  cam.position.set(3.8, 2.5, 6.8);   // axonometric vantage so z-depth reads
  cam.lookAt(0, 1.18, 0);
}

function resize() {
  const w = mount.clientWidth, h = mount.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const aspect = w / h, view = 3.35;
  cam.left = -view * aspect; cam.right = view * aspect; cam.top = view; cam.bottom = -view;
  cam.updateProjectionMatrix();
  const m = matchMedia('(max-width: 720px)').matches;   // track the live breakpoint
  if (m !== mobile) { mobile = m; if (bidCols) { updateColumns('bid', bidCols); updateColumns('ask', askCols); } }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!running) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.05); last = now;

  quoteClock += dt;
  if (quoteClock >= QUOTE_EVERY && !reduce) { quoteClock = 0; quote(); }

  if (settleT < 1) {
    settleT = Math.min(settleT + dt / SETTLE, 1);
    const e = ease(settleT);
    for (const side of ['bid', 'ask']) {
      const s = book[side];
      for (let i = 0; i < LEVELS; i++) s.cur[i] = s.start[i] + (s.tgt[i] - s.start[i]) * e;
      s.bestPrice = s.startBest + (s.tgtBestPrice - s.startBest) * e;
    }
    book.closeAmt = book.startClose + (book.tgtClose - book.startClose) * e;
    buildStaircase('bid', bidLine.geometry);
    buildStaircase('ask', askLine.geometry);
    updateColumns('bid', bidCols);
    updateColumns('ask', askCols);
    updateClosure();
    refreshHUD();
  } else if (book.tgtClose === 1) {
    // fade the closure line out after it has drawn
    book.closeAmt = Math.max(book.closeAmt - dt * 0.6, 0.0);
    updateClosure();
  }

  renderer.render(scene, cam);
}

function init() {
  const w = mount.clientWidth || 800, h = mount.clientHeight || 450;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    // No WebGL: present a static, labeled frame instead of a frozen empty well.
    mount.classList.add('no-webgl');
    if (elBid) elBid.textContent = '0.6120';
    if (elAsk) elAsk.textContent = '0.6160';
    if (elSpread) elSpread.textContent = '40';
    if (elClosure) elClosure.textContent = '— static frame —';
    return;
  }
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  setupCamera(w, h);

  // faint price grid (taupe) — vertical ticks + baseline
  const gpts = [];
  for (let gx = -4; gx <= 4; gx++) { gpts.push(gx * 0.8, 0, ZS + 0.2, gx * 0.8, MAXY, ZS + 0.2); }
  gpts.push(-4, 0, ZS + 0.2, 4, 0, ZS + 0.2);     // baseline +z
  gpts.push(-4, 0, -ZS - 0.2, 4, 0, -ZS - 0.2);   // baseline -z
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3));
  grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: C.muted, transparent: true, opacity: 0.18 }));
  scene.add(grid);

  // ladders (bone polylines) — preallocated, mutated in place
  const mkLine = () => {
    const n = LEVELS * 2 + 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: C.paper, transparent: true, opacity: 0.92 }));
  };
  bidLine = mkLine(); askLine = mkLine();
  scene.add(bidLine, askLine);

  // flat depth columns (instanced, monochrome-flat, no lighting)
  const box = new THREE.BoxGeometry(1, 1, 1);
  bidCols = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: C.bid, transparent: true, opacity: 0.5 }), LEVELS);
  askCols = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: C.ask, transparent: true, opacity: 0.5 }), LEVELS);
  bidCols.frustumCulled = false; askCols.frustumCulled = false;
  scene.add(bidCols, askCols);

  // closure line (vermilion) — drawn only when crossed
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  closure = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0 }));
  scene.add(closure);

  // first quote + build
  quote();
  for (const s of ['bid', 'ask']) book[s].cur = book[s].tgt.slice();
  book.bid.bestPrice = book.bid.tgtBestPrice; book.ask.bestPrice = book.ask.tgtBestPrice;
  buildStaircase('bid', bidLine.geometry); buildStaircase('ask', askLine.geometry);
  updateColumns('bid', bidCols); updateColumns('ask', askCols);
  updateClosure(); refreshHUD();

  addEventListener('resize', resize, { passive: true });

  if (reduce) { renderer.render(scene, cam); return; } // one static labeled frame

  // pause when offscreen
  const io = new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0.05 });
  io.observe(mount);

  last = performance.now();
  raf = requestAnimationFrame(frame);
}

if (mount) init();
