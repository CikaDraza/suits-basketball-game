# Shaq animated GLB — isolated development inspection

Date: 2026-11-08. Base: `4df1f56` on `feat/dribble-1`. No commit, push or merge
was performed for this task. Neither GLB was modified.

Subsequent user-authorized in-game trial: [Shaq walking in game](shaq-walking-in-game.md).
The source-preservation statements below describe the original isolated-preview step.

## Open the preview

```bash
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
```

Open <http://127.0.0.1:5181/game/dev/animation-preview.html>.
The same `/game/dev/animation-preview.html` path works on the regular development
server's port. This is a separate HTML/module entry: it does not import `App`,
the game stores, Rapier, `Character`, ball handling, IK or gait. Vite's normal
production build does not include this HTML entry or its preview modules.
The GLB in `public/models` follows the existing public-asset copy behavior.

Left: original Shaq in the authored rest pose. Right: the walking export, at its
authored scale and with its root translation retained. Orbit/pan/zoom are local
to this scene. Play, Pause, Restart, speed 0.1–2× and a clip selector control the
exported clips. Optional controls reveal the primary skeleton, hide the original
comparison model, or reveal auxiliary FBX objects. Nothing is silently deleted.

`useGLTF` loads both assets. `SkeletonUtils.clone` provides independent skeletons.
Drei `useAnimations` owns the Three.js `AnimationMixer` and its single per-frame
advance. Explicit UI/seek evaluations use `update(0)` without advancing time.
No procedural arm/leg pose or physics path participates. The skeleton overlay
uses the model's world transform once, outside the display-offset group.

## Export inventory and compatibility

| Property                 |   Original |                     Walking test |
| ------------------------ | ---------: | -------------------------------: |
| File bytes               | 12,641,480 |                       14,557,860 |
| Meshes                   |          8 |         10: 8 Shaq + 2 auxiliary |
| Skeletons                |          1 |                                2 |
| Primary Shaq bones       |         65 |                               65 |
| Materials                |          5 | 7: original 5 + 2 Beta materials |
| Embedded images/textures |      6 / 6 |                            6 / 6 |
| Rest height              | 2.160000 m |                      2.1599995 m |

All 65 primary bone names and parent relationships match. No missing, added or
reparented primary bones. Maximum rest world-position difference: **0.004313 mm**.
Normalized quaternion comparison: local-axis difference ≤0.00003590 rad and
world-axis difference ≤0.00004037 rad; local-scale difference ≤0.000000537.
These checks inspect actual instantiated bones, not merely a Mixamo-name regex.

The six embedded image payloads have identical SHA-256 hashes between files.
The original color, normal and ORM images remain present. All eight primary
meshes retain their morph-target counts. Six face mesh node labels gained
Blender's `.001` suffix (sanitized by GLTFLoader, e.g. `shaq_EyeLeft001`); future
code that depends on exact mesh names needs to account for that rename.

| Embedded clip                               |    Duration | Tracks | Actual targets                           |
| ------------------------------------------- | ----------: | -----: | ---------------------------------------- |
| `Armature.001\|mixamo.com\|Layer0 Retarget` | 1.0666667 s |    195 | Shaq, 65 bones × position/rotation/scale |
| `FaceDemo`                                  | 3.2000000 s |      6 | Shaq morph targets                       |
| `Armature.001\|mixamo.com\|Layer0`          | 1.0666667 s |    195 | Auxiliary Mixamo rig only                |

All tracks resolve to existing objects. The default is the **Retarget** clip,
whose 195 tracks bind exclusively to Shaq. The source clip does not animate
Shaq; selecting it displays an explicit warning.

## Findings that need export/authoring review

1. **Leftover source FBX geometry.** `Armature.001`, `Beta_Joints` and
   `Beta_Surface` are exported alongside Shaq, including the source rig's clip.
   `Beta_Joints` contains auxiliary joint geometry; enabling raw export visibly
   exposes the extra pink FBX character/joints. The default preview hides that
   separate branch while preserving the file. Export only the intended Shaq
   hierarchy and intended actions when preparing a clean production asset.
2. **Large first-key root discontinuity.** Hips local position changes from
   `(0.05732, 1.08713, 0.89264)` at 0 s to
   `(0.00074, 1.12610, 0.01775)` at 0.033333 s: approximately **0.8776 m**.
   The first Hips key repeats the value at 0.5 s. This suggests a wrong leading
   baked pose; the exact Blender/Rokoko authoring cause has not been established.
   Preview playback preserves the discontinuity and reports it.
3. **The walk is not in-place or a seamless stationary loop.** Hips world Z
   spans **1.89733 m** and net displacement over the complete clip is
   `(-0.05658, +0.03897, +1.02246)` m. Repetition therefore jumps back. Review the
   leading frame and the intended root-motion/in-place export contract before
   any gameplay integration; this preview does not subtract root motion.
4. **Ground alignment.** Across every authored walking key pose, the lowest
   character surface is **−0.04845 m** relative to the zero grid. No floor offset,
   collider or foot IK conceals it. Ground contact needs separate authoring review.
5. **Garment deformation.** Every vertex and triangle edge of the eight Shaq
   meshes was evaluated at 33 poses, including both endpoints: **25,374 vertices
   and 43,476 triangle-edge occurrences per pose**, with zero non-finite vertices.
   Maximum absolute edge growth is **95.23 mm** in `Shaquille_ONeal_Mesh` at
   0.833333 s: vertices **2672/1442**, rest 67.36 mm → 162.60 mm. Their influences
   include `RightUpLeg`, `LeftUpLeg` and `Hips`, at crotch/upper-thigh height.
   This is garment stretching, rather than evidence of a finger spike. The
   largest relative edge ratio anywhere in that mesh is 5.77; it is a separate
   statistic from the maximum absolute growth. Captured hand poses show no long
   finger triangles, but the garment/ground defects prevent a blanket claim of
   perfect deformation. Interpolated poses between the sampled keys are not
   exhaustively checked.
6. **Face clip retiming.** `FaceDemo` was 4.0 s in the original and is 3.2 s in
   the new file. That ratio is consistent with a 24→30 FPS reinterpretation
   (inference, not a verified Blender setting). Review the scene/action timing
   before replacing any existing facial-animation asset.

The retargeted skeleton is compatible for this isolated playback test. The
delivered export still needs cleanup and motion/ground/deformation review;
it is **not accepted as a gameplay replacement** by this inspection.

## Verification

- `npm run check`: 107/107 unit/rig tests, TypeScript, ESLint and formatting pass.
- `npm run build`: pass, with the existing large-chunk warning. Production JS
  contains no preview module, preview global or walking-test asset reference;
  `dist/dev/animation-preview.html` is absent.
- Separate preview browser suite: 2/2 pass (controls, full clip loops, speed,
  pause/restart, raw export, primary rig, textures, both hands and both feet).
- Existing `tests/browser/gameplay.spec.ts`: 3/3 pass (movement/dribble/shot,
  model cache/reset/inbound and screenshot/mobile layouts). The full 48-test
  gameplay suite was not repeated because no gameplay source was changed.

Commands:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/dmdevelo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
npx playwright test --config playwright.animation-preview.config.ts

PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/dmdevelo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
npx playwright test tests/browser/gameplay.spec.ts
```

Preview captures include clean/raw comparison, skeleton overlay and paused
walking poses at 0, 0.033333, 0.266667, 0.533333, 0.8 and near 1.066667 s.
Final local artifacts: `playtest/animated-glb-preview-complete/` (including
`inspection.json`) and `playtest/animation-preview-gameplay-smoke/`. Preview
tests also assert skeleton-overlay world alignment error <0.000001 m; its
lines were visually checked against the posed model.
Browser inspection uses real embedded textures, Chromium and SwiftShader.
CPU tests replace image decoding with empty textures only for numerical rig
analysis; they are not used as proof of rendered material appearance.
Numerical limb ranges are measured relative to Hips so root movement cannot
falsely pass the limb-motion check. These are preview/export tests, not
foot-planting or physical gameplay tests. Initial browser failures were a test
label selector and a missing preview favicon; both were corrected without
changing either GLB or gameplay.

## Files and source preservation

New files only: `dev/animation-preview.html`, `src/dev/animation-preview/*`,
`playwright.animation-preview.config.ts`, `tests/animated-glb-preview.test.ts`,
`tests/animation-preview-browser/preview.spec.ts` and this report. Default
gameplay entry points, manifest, assets, physics, ball handling, IK, locomotion
and the existing Playwright configuration remain unchanged.

Unmodified GLB SHA-256:

```text
shaquille_oneal.glb
2501bf68c682e1f412df660aa239efec0865eedc3f9c042cc44ebcd9c850750b

shaquille_oneal_walking_test.glb
9ddf028f4b4f2e7074c715ee08a8d8f3ec5fdf6e2159b4c35cc3dc4b49eda5d9
```
