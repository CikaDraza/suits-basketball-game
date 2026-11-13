# DIAG-1 — Motion Recorder and command audit

Branch: `feat/diag-1-motion-recorder`, based on TRAIN-1 (`d56ea7f`).

## Use

1. Start the development app (`npm run dev`) and open `/game/`.
2. Enter Training → Free Movement, or use Duel for ball actions.
3. Open **Gameplay Debug → GAMEPLAY**, then **RECORD**.
4. Use normal keyboard, touch or gamepad controls. The recorder continues when the
   widget is closed and across pause/resume or session/character changes.
5. **STOP → EXPORT JSON** downloads the pinned capture. **RECENT 30s JSON** exports
   the rolling history instead. A new Record starts a new capture.
6. Attach the JSON when reporting a problem; include intended action and, when
   useful, a gameplay screenshot. No data is sent automatically.

The recorder is development-only. Production Training and Duel have neither the
widget nor the diagnostics test API. Solo and 1v1 are still future modes.

## What is measured

The widget shows INPUT, COMMAND, BODY and BALL. The timeline connects physical
input, mapped action, gesture recognition/queueing, gameplay acceptance/rejection,
execution, state changes, and observed final Character layers. Timeline rows expand
for raw data. Existing RS vectors/mapping remain under **RS DETAILS**.

Requests and decisions have source timestamps, revision/tick and command IDs.
Reasons include neutral requirements, missing ownership, crossing already active,
charging, disabled modes, cooldowns, and queued-command cancellation. Possession
losses identify moving-skill risk, steals, flops, exhaustion and trip contact.
Rapier contact observations distinguish an actual pair from a gameplay shove.

Physics and pose samples target 10 Hz independently of the UI. They contain body
positions/velocities, ball state/motion/skill phase, foot support, relevant joint
positions/quaternions, observed layer owners and measured arm IK data. The capture
includes config/bindings, model/config SHA-256 digests, code/build identity, initial
seed, initial runtime/physics and a checkpoint at Record time.

Measured threshold findings include elbow/wrist range, elbow plane, palm target
error and DEF-ARM-001 side/palm/opposite-guard checks. Measurements and thresholds
are exported. These are deterministic structural checks, not an AI diagnosis or a
claim that an animation looks natural.

Limits: recent 30 seconds; explicit recording up to 60 seconds; hard event/sample/
context caps with explicit stop reasons and eviction counts. Stop freezes the
capture while rolling history continues. The recorder is local and UI-independent.
This is a diagnostic trace; automatic replay, video capture and AI requests are
not implemented.

## Files

- `src/game/diagnostics/recorder.ts`: bounded storage, clocks, capture lifecycle,
  checkpoints and versioned JSON export.
- `src/game/diagnostics/motionAudit.ts`, `gestureAudit.ts`, `rules.ts`: simulation,
  input, pose and contact observers, correlation, and measured checks.
- `src/game/entities/Duel.ts`, `Character.tsx`: read-only observations at existing
  input/gameplay/physics/final-pose boundaries; no new animation or gameplay policy.
- `src/game/input/{dribbleSkillBuffer,defensiveHands,useGamepadPause}.ts`: optional
  gesture observers and physical pause audit.
- `src/game/state/{gameStore,inputStore}.ts`: screen/reset and short input-edge
  evidence.
- `src/components/touch-overlay/{useInputBridge,useKeyboardInput,useActionButton}.ts`,
  `TouchOverlay.tsx`, `types.ts`: source/control identity and binding-change evidence.
- `src/game/harness/{GameplayDebugOverlay,MotionAuditPanel}.tsx`,
  `right-stick-debug.css`: existing widget expansion, local download, timeline, and
  touch-safe bounds.
- `src/game/harness/{exposeTestSeam,useDuelTestSeam}.ts`: development diagnostics
  adapters for browser checks; omitted in production.
- `vite.config.ts`, `src/vite-env.d.ts`: development build/engine/asset identities.
- `tests/motion-recorder.test.ts`, `tests/browser/motion-diagnostics.spec.ts`:
  storage, observer/rule and real-gameplay/export coverage.

## Architecture and follow-up

[Phase 5 — Gameplay Debug](gameplay-debug.md) extends this recorder with separate
request/decision/execution/pose evidence, command history for both players and
live imported walk/defense clip details. RS vectors remain under RS DETAILS.

[Shared development architecture](motion-development-architecture.md) covers
Diagnostics, all Training contracts, the future Animation Ownership Contract,
MOCAP slices and the offline Motion Analysis Agent. DIAG-1 reports current layer
ownership without adding an animation controller or a second mixer. The future AI
agent must distinguish facts, threshold findings, hypotheses and proposed changes.

## Verification and evidence

- `npm test`: 191 passed, including bounded storage, detached payloads, pinned Stop,
  duration/capacity limits, gesture cancellation/rejection, checkpoints and rules.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`: passed
  (Vite retains its existing large-chunk advisory).
- Browser regressions: 20 passed across Diagnostics, Training, Duel, keyboard/touch,
  defensive poses, and dribble combinations. The production-only test is skipped
  in the dev batch and passed separately against the production preview.
- The final DIAG scenarios passed again after checking exported real IK payloads;
  valid vector/boolean debug fields no longer produce false nonfinite warnings.
- Production JS contains neither the recorder schema nor the diagnostic widget;
  normal Training has no diagnostics test API.

Local evidence is git-ignored, consistent with existing project reviews:

- [Screenshot gallery](../playtest/diag-1/index.html)
- [Command audit](../playtest/diag-1/motion-audit.png)
- [Body and ball](../playtest/diag-1/body-ball-audit.png)
- [Event timeline](../playtest/diag-1/event-timeline.png)
- [Original RS details](../playtest/diag-1/right-stick-details.png)
- [Compact phone panel](../playtest/diag-1/phone-audit.png)
- [Recorded defensive gesture JSON](../playtest/diag-1/defense-recording.json)
- [Keyboard/touch JSON](../playtest/diag-1/keyboard-touch.json)
- [Duel skill JSON](../playtest/diag-1/duel-skill-trace.json)

The compact panel scrolls so touch controls remain reachable. Physical gamepads and
mobile devices still require hands-on review. No merge is performed before visual
acceptance.
