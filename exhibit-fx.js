// Exhibit 01 — volumetric FX module.
// (1) The depth-manifold ShaderMaterial: near-ink fill + view-dependent bone
//     fresnel rim, low-saturation teal/brick tint, manual FogExp2 matching the
//     scene fog. No light rig. Depth fed as a uniform array, sampled per-vertex.
// (2) Selective bloom: layer-isolated two-composer rig so ONLY the closure arc
//     ever glows — never the instrument. Ref: webgl_postprocessing_unreal_bloom_selective.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const BLOOM_LAYER = 1;

// ── depth-manifold material ────────────────────────────────────────────────
// Piecewise-linear cumulative-depth profile is summed in the vertex shader from
// two small uniform arrays (constant-bounded loop => valid GLSL ES 1.00 indexing,
// no per-frame geometry rebuild). PlaneGeometry local coords are reused:
//   position.x ∈ [-.5,.5] → price-axis parameter t ∈ [0, uMaxT]
//   position.y ∈ [-.5,.5] → z-slab parameter (rounds the ridge crown)
export function makeManifoldMaterial(C, count) {
  const N = count + 1; // padded sample count
  const zero = new Array(N).fill(0);
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: {
      uDepth:   { value: zero.slice() },
      uX:       { value: zero.slice() },
      uMaxT:    { value: count - 1 },
      uZc:      { value: 0 },
      uZHalf:   { value: 0.5 },
      uTopY:    { value: 2.7 },
      uBase:    { value: new THREE.Color(C.ink) },
      uFill:    { value: new THREE.Color(C.fill) },
      uRim:     { value: new THREE.Color(C.paper) },
      uFogColor:{ value: new THREE.Color(C.ink) },
      uFogDensity: { value: 0.0 },
      uCamDir:  { value: new THREE.Vector3(0, 0, -1) },
      uReveal:  { value: 1 },
    },
    vertexShader: /* glsl */`
      uniform float uDepth[${N}];
      uniform float uX[${N}];
      uniform float uMaxT, uZc, uZHalf, uTopY, uReveal;
      varying vec3 vWorldPos;
      varying float vH;
      varying float vEdge;
      varying float vFogDepth;
      void main() {
        float t = (position.x + 0.5) * uMaxT;
        float h  = uDepth[0];
        float wx = uX[0];
        for (int k = 0; k < ${count}; k++) {
          float seg = clamp(t - float(k), 0.0, 1.0);
          h  += (uDepth[k + 1] - uDepth[k]) * seg;
          wx += (uX[k + 1]    - uX[k])    * seg;
        }
        float az = position.y;                       // -.5 .. .5 across the slab
        float edge = clamp(1.0 - pow(abs(az) * 2.0, 3.0), 0.0, 1.0);
        float wz = uZc + az * (uZHalf * 2.0);
        float y  = h * mix(0.5, 1.0, edge) * uReveal; // rounded crown + grow-in
        vec3 wpos = vec3(wx, y, wz);
        vWorldPos = wpos;
        vH   = clamp(h / uTopY, 0.0, 1.0);
        vEdge = edge;
        vec4 mv = modelViewMatrix * vec4(wpos, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWorldPos;
      varying float vH;
      varying float vEdge;
      varying float vFogDepth;
      uniform vec3 uBase, uFill, uRim, uFogColor, uCamDir;
      uniform float uFogDensity;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
        vec3 V = normalize(-uCamDir);
        float fres = pow(1.0 - abs(dot(n, V)), 2.6);
        vec3 fill = mix(uBase, uFill, vH * 0.7 + 0.05);
        fill *= mix(0.52, 1.0, vEdge);               // crease/AO at slab edges
        vec3 col = mix(fill, uRim, clamp(fres, 0.0, 1.0) * 0.8);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// push the eased book state into a manifold material's uniforms (per settle frame)
export function feedManifold(mat, depthArr, xArr) {
  const d = mat.uniforms.uDepth.value, x = mat.uniforms.uX.value;
  const n = depthArr.length;
  for (let i = 0; i < d.length; i++) {
    d[i] = depthArr[Math.min(i, n - 1)];
    x[i] = xArr[Math.min(i, n - 1)];
  }
}

// ── selective bloom rig ────────────────────────────────────────────────────
// bloomComposer renders ONLY the bloom layer (the arc) against black; finalComposer
// renders the full scene then additively composites the blurred bloom on top.
export function setupBloom(renderer, scene, cam, w, h, ink) {
  const size = new THREE.Vector2(w, h);

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, cam));
  const bloomPass = new UnrealBloomPass(size.clone(), 0.0, 0.7, 0.0); // strength(set per-frame),radius,threshold(0: whole arc glows vs black)
  bloomComposer.addPass(bloomPass);

  const finalRT = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, samples: 4,           // MSAA
  });
  const finalComposer = new EffectComposer(renderer, finalRT);
  finalComposer.addPass(new RenderPass(scene, cam));
  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture:  { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D baseTexture, bloomTexture;
        varying vec2 vUv;
        void main(){
          gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
        }`,
      defines: {},
    }),
    'baseTexture'
  );
  mixPass.needsSwap = true;
  finalComposer.addPass(mixPass);
  finalComposer.addPass(new OutputPass());

  const blackBg = new THREE.Color(0x000000);

  function render() {
    // 1 — bloom pass: isolate the bloom layer against black
    const prevBg = scene.background;
    scene.background = blackBg;
    cam.layers.set(BLOOM_LAYER);
    bloomComposer.render();
    // 2 — final pass: whole scene + additive bloom
    scene.background = prevBg;
    cam.layers.set(0);
    finalComposer.render();
  }

  // cheap path when no arc is live: full scene + the (already-black) bloom buffer
  function finalRender() {
    cam.layers.set(0);
    finalComposer.render();
  }

  function setSize(nw, nh, dpr) {
    bloomComposer.setSize(nw, nh);
    finalComposer.setSize(nw, nh);
    bloomComposer.setPixelRatio(dpr);
    finalComposer.setPixelRatio(dpr);
    bloomPass.resolution.set(nw, nh);
  }

  return { render, finalRender, setSize, bloomPass };
}
