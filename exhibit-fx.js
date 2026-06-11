// Exhibit 01 — Evidence → Verdict · WebGPU/TSL FX module.
// Node materials (no light rig — fresnel rim done in TSL) + a single threshold
// bloom. On the near-ink palette only the ignited vermilion verdict ring ever
// crosses the bloom threshold, so "one thing glows" is preserved for free —
// no MRT, no layers. Falls back to WebGL2 automatically via WebGPURenderer.
import * as THREE from 'three/webgpu';
import { color, positionWorld, normalWorld, cameraPosition, float, mix, uniform, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export const PAL = {
  ink:      0x161210,
  paper:    0xede4d3,
  muted:    0x8a7f6e,
  accent:   0xd6452b,
  accentHot:0xff6a3c,   // pushed >1 when ignited so it (and only it) blooms
  nodeFill: 0x7d7363,   // taupe token base — clearly visible, still sub-threshold
  claimFill:0x9a8e78,
  ringFill: 0x241c16,
};

// A bone token material: near-ink fill + a view-dependent paper fresnel rim.
// Stays well under the bloom threshold so it never glows.
export function tokenMaterial(baseHex, rimHex = PAL.paper, rimAmt = 0.5) {
  const m = new THREE.MeshBasicNodeMaterial();
  const V = cameraPosition.sub(positionWorld).normalize();
  const fres = float(1).sub(normalWorld.dot(V).abs()).pow(2.4);
  m.colorNode = mix(color(baseHex), color(rimHex), fres.mul(rimAmt));
  return m;
}

// The one bright element. `ignite` (0..1) drives an HDR vermilion that crosses
// the bloom threshold. Returns { material, ignite } — set ignite.value per frame.
export function verdictMaterial() {
  const ignite = uniform(0);
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = mix(color(PAL.ringFill), color(PAL.accentHot).mul(2.6), ignite);
  return { material: m, ignite };
}

// Single global bloom, high threshold => selective on a dark scene.
export function setupPostFX(renderer, scene, cam) {
  const post = new THREE.PostProcessing(renderer);
  const scenePass = pass(scene, cam);
  const col = scenePass.getTextureNode();
  const b = bloom(col, 0.9, 0.55, 0.72);   // strength, radius, threshold
  post.outputNode = col.add(b);
  return { render: () => post.renderAsync() };
}
