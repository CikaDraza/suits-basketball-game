# DEFENSE-1 implementation and verification

Implementation branch: `feature/defense-1`. PR target: `staging`.

## Slice A — stance and locomotion

Root causes:

- `importedDefense.apply()` sampled all arm tracks every frame. Neutral RS disabled the
  overriding IK, revealing the still-active overhead clip. Arm ownership now transfers
  once per stance entry and remains with the defensive controller through neutral.
  The torso/lower stance continues independently. The full original clip is restored
  on the next stance entry; its asset, timing and character model are unchanged.
- `deriveStates()` and `defensiveFacing()` automatically guarded any nearby ball handler,
  even immediately after explicit Q exit. That prevented the upright/forward walking
  eligibility gate from opening. `Fighter.defenseReleased` records the existing Q
  decision, suppressing only that proximity fallback until Q re-entry/reset. Possession,
  receiving and inbound denial retain their priority. This is input intent in the
  existing authoritative Fighter, not another gameplay state machine.
- Planted gait targets kept the capsule's initial spawn height after Rapier settled
  onto the court. This could leave the shoes about 3 cm above the court. Planted feet
  now follow the measured support plane vertically while retaining world-fixed X/Z/yaw.
- The old ready FK/IK targeted a high, inward, symmetric guard. The new relaxed ready
  target opens the arms and lowers the hands below the chest, with slight asymmetry.

Entry/exit captures the actual last rendered bones before FK/IK resets. Q exit clears
the accepted hand input and requires neutral before a new gesture. Existing hand/ball
IK retains priority. No mixer or animation state machine was added.

Verification artifacts are under `playtest/defense-1-a/` (both characters' real gamepad
RS → neutral → Q exit → walking screenshots and `stance-evidence.json`) and
`playtest/defense-1-stance/` (original Q/capsule/shoe regression tests).

The original stance test now waits for measured shoe support as well as planted gait
targets after a reset. The original numerical support limits remain unchanged.

Visual review remains necessary for the relaxed guard and transition weight/feel.

## Slice B — defensive orientation

Off-ball Q stance previously faced `rim + PI`, even when the defended player was on
the other side. It now requests yaw from actual player/opponent X/Z positions. The
existing shortest-angle damping applies that yaw. LS retains the established calibrated,
camera-relative movement transform and continues moving the physical capsule in any
direction, including away from contact. Free Movement permits movement-driven yaw in
stance. Ball-owning post-up and inbound-receiver facing retain their existing rules.

Turning/locomotion hands foot placement to gait/IK for the remainder of that stance
entry. Previously the stationary GLB lower layer could reclaim stale foot positions
between steps. A new stance entry resets this presentation ownership. Stationary,
uninterrupted playback still uses the complete approved sequence.

The universal Gameplay Debug and its JSON pose samples include merged LS, requested
world velocity, actual measured velocity, opponent relative position, requested/actual
yaw, final ankle transforms, target error, calibrated support height, and measured
horizontal speed while planted. These are observations, not control state. JSON joint
samples retain final shoulder/elbow/hand transforms and layer ownership.

Browser evidence: `playtest/defense-1-b/` and `playtest/defense-1-b-chuck/` contain
front/side/rear camera screenshots and `rotation-evidence.json`. The scenario tests
front, left, right, behind and diagonal opponent positions, then a lateral arc. The
first Shaq pass after retaining gait ownership measured maximum planted ankle sliding
of approximately 0.0000174 m/s in that arc.

## Slice C — Brace and Push

Brace reuses the existing command. Relative opponent position selects its contact arm
with the existing centerline hysteresis; the other arm extends for balance. The
contact target is the near surface of an oriented lower-torso envelope derived from
the opponent's actual position, yaw, capsule support height and legend proportions.
The solver aims a near-90-degree elbow and approximately horizontal forearm at that
target, with bounded anatomical reach. An unreachable target remains a miss. Free
Movement uses a local virtual target and cannot establish physical contact.

The contact solver may gradually change its elbow bend side and unwind forearm twist
after an overhead action. Other IK actions retain the original singularity and wrist
continuity behavior. Original numerical IK regression tolerances are unchanged.

Push retains double rear-flick recognition, neutral rearming and the 0.75 s cooldown.
Its 0.72 s motion has 0.20 s preparation, 0.20 s extension and 0.32 s recovery. Maximum
extra arm extension is 0.12 m. Torso participation and a contact-ready lower posture
are derived from the current action. The mass-scaled velocity kick is reduced from
4.5 to 1.8 m/s before the mass ratio. A short contact window accommodates render rates
slower than physics without inferring a hit from animation progress.

Range and facing still gate the impulse. Additionally a recent rendered forearm must
actually reach the torso envelope, with both players still close to the sampled
positions. Each action resolves at most once. Debug JSON separates gesture acceptance,
animation execution, capsule range, measured contact, requested velocity change,
applied impulse, physical velocity and measured target displacement. No-op training
uses `push.performed` with null target and false contact/impulse fields.
The legacy `Fighter.defensePushApplied` flag means the attempt has been resolved;
the new `PushEvidence.impulseApplied` field is the actual physical result.

The universal Gameplay Debug shows contact side, phase, target, actual nearest forearm
point and gap, plus the separately observed push outcomes. Training evidence with
front/side/rear Brace screenshots and all three Push phases is in
`playtest/defense-1-c-training/`. Contact regression JSON is in
`playtest/defense-1-c-contact/` and `playtest/defense-1-c-regression/`.

Contact uses an anatomical torso envelope, not a skinned triangle collision mesh.
Visual acceptance is needed for the lean, contact height, balance arm, short extension,
recovery and perceived shove weight.

The close-contact positive fixtures use 0.85 m capsule-center separation (capsule
diameter 0.84 m); the negative fixtures use 1.25 m, inside the legacy 1.3 m range
but outside measured forearm reach. Observed target displacement in the final contact
scenario was approximately 0.317 m for Shaq's shove and 0.289 m for Chuck's. A deeper
supported base also lets Shaq reach the shorter Chuck's lower torso. The numerical
forearm contact tolerance was retained at 0.13 m throughout the reach investigation.

## Slice D — Small Jump

The supplied file is `public/models/animations/shaq_small_block_jump.glb`, SHA-256
`9588b7e162af1467f3f305a31ed15c79dba387ad015a85b4088245de8283f491`.
Unlike the raw source described in the brief, this Blender export already contains
`Small_jump_block Retarget` on Shaq's 65-bone Mixamo skeleton, plus a FaceDemo action.
Direct validation against the active Shaq rig reports identical bone hierarchy,
local positions/scales and world matrices; maximum rest quaternion difference is
approximately 0.000000052 radians. No new retargeting or guessed bone mapping was
needed, and the supplied file is unchanged.

Independent motion sampling found several attempts, not one 7.83-second gameplay
jump. The first short attempt contains preparation at about 0.53–0.77 s, takeoff
around 0.77–0.90 s, an airborne right-arm reach around 0.90–1.10 s, and landing/recovery
through about 1.45 s. These boundaries describe visual motion, not physical contact
measurements. `scripts/prepare-small-jump.mjs` validates the supplied retarget, crops
frames 16–44 exclusive at 30 fps, and exports
`public/models/animations/shaq_small_block_jump_clean.glb` (77,328 bytes, about 0.917 s).
Constant tracks are optimized by the exporter. A zero-area proxy declares the glTF
skin joints; it is never mounted in gameplay or the preview. No source character mesh
or texture is exported into the clean animation.

`/game/dev/jump-preview.html` reuses the existing isolated preview infrastructure.
The clean clip passed rig validation and a real browser inspection of preparation,
takeoff, reach, landing and recovery before gameplay integration. Evidence is in
`playtest/defense-1-jump-preview/`; motion sampling and preparation reports are in
`playtest/defense-1-jump/`.

Gameplay adds configurable `JUMP`: keyboard **F**, gamepad **Triangle/Y**, and a
separate **↑** touch button. Default gamepad stance moves from Triangle/Y to
**Circle/B**; keyboard Q and the existing touch triangle remain stance controls.
Legacy profiles migrate the old default without firing stance and jump together.
Custom bindings remain configurable through Controls.

The existing Fighter owns an orthogonal jump state. Preparation requests one vertical
velocity change; actual Rapier capsule height/velocity establish flight and landing.
Ground support uses the actual capsule bottom and vertical velocity on the flat court.
Midair/preparation/recovery requests reject, and held input cannot repeat after landing.
Shaq's quaternion-only jump layer runs in the existing Character pose pass. It applies
no root position/scale tracks and creates no gameplay mixer. Chuck uses the existing
procedural pose machinery for a one-arm hop with the same physical control. Ball-hand
IK retains priority. When holding/catching a ball, the jump clip poses only the legs;
the existing procedural torso/shoulders and ball-hand IK retain the upper body. The
source block pose otherwise moved Shaq's shoulder girdle beyond the two-hand grip's
reach, leaving an approximately 8 cm palm gap in real flight. The focused browser
regression measures final palm error during the actual physical hop for both legends.
Stance arm ownership survives a jump; landing replants gait feet.

Observed hop height is approximately 0.239 m. Keyboard, gamepad and touch tests exercise
three separate jumps per character, airborne rejection, held-button rearming, physical
flight, landing/shoe support and return to walking. Physics tests repeat at 30/60/120 Hz.
An opposing shot requests a bounded one-arm reach toward the actual ball. Debug records
actual hand-to-ball distance and contact preview separately from `blockApplied`, which
remains false in this iteration. A nearby loose ball selects `rebound-ready` context;
ordinary ground pickup cannot occur from a 2D distance check while airborne.

**Remaining scope:** shot deflection, rebound possession, jump dunks and a Chuck mocap
jump are not implemented. A contact preview is not reported as a successful block.
The user confirmed that Small Jump works on 2026-11-19. Remaining visual review:
relaxed guard/Brace silhouette, shove weight and recovery, Chuck's procedural
fallback, and the five-button mobile layout. The isolated preview still permits
frame-by-frame review of the crop and takeoff/reach/landing blend.

## Final regression findings

The full gameplay browser run exercised 87 tests: 79 passed, one production-only
test skipped on the development server, and seven failures were investigated.
Artifacts from that initial run remain in `playtest/defense-1-regression/`.

- Shaq's scalar model preload and combined model/clip load used different cache
  keys. Preloading the same bundle as gameplay removes the duplicate GLB request;
  matchup swaps still request exactly four unique assets.
- The new off-ball ready fallback also matched an inbound offense receiver's Q
  post. It now excludes `awaitingPass`, preserving the existing asymmetric contact
  and asking arms and all offense-facing rules.
- The post-step test used camera geometry rather than the established calibrated
  input angle. Using `config.camera.inputAngle` restores its intended backing
  direction; all existing lift, support, planted-contact and travel assertions stay.
  Screenshot encoding now pauses simulation so evidence capture cannot consume
  the five-second inbound pass window.
- The RS overlay tests now open its existing RS DETAILS tab before asserting the
  selected action. The universal widget's default remains GAMEPLAY.
- Cooldown rejection is propagated into the diagnostic hand-command reference.
  Push execution is confirmed only by Duel after its cooldown decision: a previous
  push's rendered pose cannot mark a newly rejected request executed before the
  next physics tick. Rejected commands retain null execution/pose evidence.

Additional browser coverage exercises a hop while holding the ball, cooldown
rejection while an earlier push animates, and Shaq's RS ownership across jump,
landing, Q exit and a fresh Q entry. Final focused evidence and logs are recorded
below.

## Verification completed — 2026-11-19

- `npm run check`: passed, including typechecks, ESLint, 210 game/unit tests,
  Prettier, and 32 analysis API tests.
- `npm run build`: passed. Vite retains its existing large-chunk advisory.
- Final focused browser verification: all 12 selected cases passed across resumed
  runs: both legends' cooldown rejection, RS/stance/walk restoration, asymmetric
  inbound poses and passing, physical post steps, controller turn/reconnect, and
  held-ball jump. Nine completed in `playtest/defense-1-finish-verified/` before the
  local browser/server processes stopped. Chuck's remaining controller case passed
  in `playtest/defense-1-final-three/`. Two initial held-hop retries there encountered
  `ERR_CONNECTION_REFUSED`; both passed after restarting Vite, with evidence in
  `playtest/defense-1-held-jump-final/`. No application assertion remains failing.
- The corrected four-unique-GLB cache test passed separately in
  `playtest/defense-1-finish/`. This directory also preserves the earlier diagnostic
  failures that prompted the cooldown/ball-grip fixes; it is not the final verdict.
- Both independent animation previews passed (full original defense, clean jump),
  including pause/seek/restart and mobile preview: `playtest/defense-1-preview-final/`.
- Production browser gate passed against `npm run preview` on port 5174: Training
  works, the recorder is absent, and no Gameplay Debug widget is rendered.
  Evidence: `playtest/defense-1-production-final/`. A static scan of built JavaScript
  also found none of the debug panel, jump preview API or recording-control strings;
  development preview HTML entries are absent from `dist`.
- Both legends retain owner 0 and fully weighted palm contact during actual
  flight. Maximum sampled airborne palm error: Shaq 0.000225 m, Chuck 0.000154 m.
  The physics takeoff count remains one and both land back in `grounded`.
- `git diff --check`: passed on `feature/defense-1`.

Final check/build/browser logs and representative held-ball flight screenshots are
collected in `playtest/defense-1-final/`. Earlier multi-angle Brace, neutral-ready,
opponent rotation and measured-contact shove evidence remains in the slice-specific
directories referenced above.

## Main files changed

- `Character.tsx`, `importedDefense.ts`, `posture.ts`, `gait.ts`, `Duel.ts` and
  `defensiveFacing.ts`: ownership, natural exit/walk, supported stance and facing.
- `defensiveArmPose.ts`, `defensiveArmContact.ts`, `defensiveArmIK.ts`,
  `defensivePushPose.ts`, `simulation/defensivePush.ts` and `game-config.json`:
  forearm biomechanics, action timing, measured contact and bounded shove tuning.
- `simulation/smallJump.ts`, `simulation/types.ts`, `simulation/runtime.ts`,
  `importedJump.ts`, `assets/manifest.ts`, clean GLB and preparation script:
  verified short jump and physics/presentation separation.
- Input bindings, gamepad reader, input store, touch bridge/overlay, HUD/Help and
  test seam adapters: configurable keyboard/gamepad/mobile jump and binding migration.
- `locomotionDebug.ts`, `motionAudit.ts`, `gameplayCommands.ts`,
  `MotionAuditPanel.tsx` and `vite.config.ts`: existing universal diagnostics,
  final joint/foot observations, action correlation, jump/contact evidence and hashes.
- Existing isolated defense preview components plus the jump HTML/entry and focused
  unit/browser tests. Preview/test-only entries remain outside the production build.
