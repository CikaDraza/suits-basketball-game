// Run: node --import tsx scripts/prepare-small-jump.mjs
// The supplied Blender export is ALREADY retargeted. Validate it before cropping.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  AnimationUtils,
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  MeshBasicMaterial,
  SkinnedMesh,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { bindAnimationClip } from '../src/game/assets/animationClip.ts';
import { isolateWalkingCharacter } from '../src/game/entities/importedWalk.ts';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const loader = new GLTFLoader();
loader.register(() => ({ name: 'InspectionTextures', loadTexture: async () => new Texture() }));
async function load(path) {
  const bytes = await readFile(path);
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
const input = 'public/models/animations/shaq_small_block_jump.glb';
const [active, source] = await Promise.all([
  load('public/models/shaquille_oneal.glb'),
  load(input),
]);
const model = clone(active.scene);
isolateWalkingCharacter(model);
const original = source.animations.find((clip) => clip.name === 'Small_jump_block Retarget');
if (!original)
  throw new Error('Expected the supplied Shaq-retargeted clip; raw KinemIQ is unsupported');
const bound = bindAnimationClip(source.scene, model, original);
const clip = AnimationUtils.subclip(bound.clip, 'SHAQ_SMALL_BLOCK_JUMP_V01', 16, 44, 30);
// glTF identifies Bone nodes through skin.joints. Keep a zero-area, three-vertex
// proxy solely to preserve that declaration; no character mesh/textures are exported.
let proxy;
const remove = [];
model.traverse((node) => {
  if (node instanceof SkinnedMesh && !proxy) proxy = node;
  else if (node.isMesh) remove.push(node);
});
if (!proxy) throw new Error('Missing compatible skeleton');
remove.forEach((node) => node.removeFromParent());
proxy.name = 'AnimationSkeletonDeclaration';
proxy.geometry = new BufferGeometry();
proxy.geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3));
proxy.geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(12), 4));
proxy.geometry.setAttribute(
  'skinWeight',
  new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
);
proxy.material = new MeshBasicMaterial();
const report = {
  source: input,
  sourceSha256: createHash('sha256')
    .update(await readFile(input))
    .digest('hex'),
  sourceClip: original.name,
  sourceDuration: original.duration,
  startFrame: 16,
  endFrameExclusive: 44,
  fps: 30,
  duration: clip.duration,
  compatibility: bound.report,
};
model.userData.smallJumpPreparation = report;
const bytes = await new GLTFExporter().parseAsync(model, { binary: true, animations: [clip] });
const output = 'public/models/animations/shaq_small_block_jump_clean.glb';
await writeFile(output, new Uint8Array(bytes));
const clean = await load(output);
report.cleanCompatibility = bindAnimationClip(clean.scene, model, clean.animations[0]).report;
await mkdir('playtest/defense-1-jump', { recursive: true });
await writeFile('playtest/defense-1-jump/preparation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, bytes: bytes.byteLength, ...report }, null, 2));
