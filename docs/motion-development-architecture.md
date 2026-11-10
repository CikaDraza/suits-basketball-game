# SUITS motion development architecture

DIAG-1 implements the recorder; MOTION-AI-1A adds the developer analysis API and
shared contracts. Training, animation ownership, motion capture and optional AI
analysis share the boundaries below; later slices are explicit.

## Current runtime and boundaries

`gameStore.session` selects Duel or Training. TRAIN-1 implements Free Movement:
one player, defense input context, no opponent or basketball body. The contracts
for Solo and role-based 1v1 exist, but those modes remain disabled.

All sessions use the same input resolver, fixed-step `Duel`/Rapier simulation,
`Character` posing, and models. Diagnostics observe those systems. They never
write gameplay state, bindings, skeleton transforms, physics tuning, possession,
or animation selection. No testMode switch is needed to record a real session.

The development pipeline is:

```text
physical input → existing resolver → requested command
                                    ↓
                           existing gameplay gates
                            queued / accepted / rejected
                                    ↓
                        actual gameplay state / action
                                    ↓
                     Character layers → final body pose
                                    ↓
                     measured thresholds / visual review
```

## DIAG-1 — Motion Recorder

The recorder is an engine-side module, separate from React. It keeps recent events
and bounded positional samples even while RS Debug is collapsed. The widget polls
at 100 ms only to display data; it does not create simulation samples or decide
whether a command ran.

Events carry a total `sequence`, monotonic elapsed wall time, session `revision`,
fixed-step `tick`, and `simulationTime`. Input and pose observations can fall between
physics steps. An observed gamepad value is timestamped when the browser polls it;
this is not a claim to capture hardware changes between browser polls. Reset starts
a new revision/tick domain without resetting the total ordering or monotonic time.

A command request has an ID equal to its request event sequence. Exports explicitly
list command references that began outside the retained window. Queue decisions,
rejections, actual execution, and observed defense animation events reference this
ID. Raw input, merged input, gameplay execution, and final pose remain distinct.
A queued skill is not declared executed until the existing ball-control handler
accepts it. Disabled/neutral-gated physical input is preserved without inventing a
recognized command. Cancellation of a queued gesture is recorded separately.

Recorded data includes:

- Keyboard codes and down/up edges, touch control/action events, gamepad physical
  axes/buttons, calibrated/mapped input, input gates, and merged movement.
- Gesture requests, queue/cancel/reject decisions and reasons, button actions,
  player mode/handling changes, active skills, ball state/possession transitions,
  gameplay loss reasons, actual Rapier contacts, and defensive push outcomes.
- Actual Character mode, arm pose, current clip and observed layer ownership,
  phase samples, joint world positions/local quaternions, measured IK values,
  foot support targets, body velocities, ball motion, and threshold findings.
- Initial runtime/physics and a fresh Record checkpoint, seed, bindings, full config/level, build commit/version and source SHA-256,
  engine versions, model/config SHA-256 digests, environment, and rule thresholds.
  Build identity describes the dev server startup; restart after source/asset edits
  when collecting comparable evidence.

Limits are centralized in `diagnostics/recorder.ts`: recent 30 seconds, explicit
recording up to 60 seconds, 6000 events, 2400 samples, 64 session contexts. State
and pose samples target 10 Hz of simulation time. Event decisions use their native
input or simulation call sites. Event/sample/context limits cannot grow without
bound. Capacity/duration stops are explicit; eviction counts are exported. Physical
pad arrays are limited to 32 axes/buttons, with layout/truncation metadata.

`Record` starts a fresh explicit capture. `Stop` freezes it while the recent buffer
continues. `Export JSON` downloads that capture (or recent history if none exists).
`Recent 30s JSON` explicitly exports the rolling history. No upload, network call,
AI request, or persistent background storage occurs. JSON format is versioned as
`suits.motion-diagnostics`, schema version 1. Unavailable/nonfinite numbers export
as `null` with a declared interpretation. This is diagnostic evidence, not a
cross-browser deterministic replay implementation.

Measured warnings are threshold checks, not proof of anatomical correctness. The
first rules cover finite measurements, elbow/wrist limits, elbow plane, and palm
target error after blending settles. DEF-ARM-001 also checks the measured lateral
reach, forward palm direction and opposite guarding elbow against explicit
thresholds, rather than trusting the requested pose label. Their units and thresholds accompany each
report. No warning is a guarantee of visually natural motion; no warning is also
not a guarantee that a pose is correct. The JSON retains measurements for further
rules and explicit before/after comparisons.

## ANIM-CORE-1 — future animation ownership contract

DIAG-1 reports current ownership. It does not install a new animation controller or
another AnimationMixer. ANIM-CORE-1 will make authority explicit before more clips
are introduced:

| Body region   | Current observed base                                | Current final correction             | Future contract                                     |
| ------------- | ---------------------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| Hips and legs | Procedural gait or imported walk                     | Foot grounding and stance            | Locomotion base, bounded planted-foot correction    |
| Spine         | Procedural posture/FK                                | Lean/twist                           | Base posture/mocap, bounded gameplay reaction       |
| Arms          | Procedural FK, including imported walk where applied | Ball-hand IK or defense-arm IK       | One base action, one declared final arm owner       |
| Hands         | Pose and palm calibration                            | The selected arm/ball contact solver | Technique pose plus bounded grip/contact correction |
| Head          | Procedural look and face                             | Gaze/blinks                          | Base animation plus anatomically bounded aiming     |

Animation cannot grant possession, move a Rapier body through an opponent, or
change scoring independently. Those changes require gameplay events. Asset IDs,
clip names/phases and layer masks will extend the diagnostic schema with a version
change when their meaning changes.

## MOCAP and Training follow-up slices

MOCAP-1 introduces a measured Defense Ready clip only after ownership is explicit.
TRAIN-2 implements Solo using the same ball state machine and normal shot/dribble
physics; practice reset occurs after an attempt. Role-based 1v1 follows later,
using existing inbound/possession rules without a score terminal condition.
MOCAP-2 adds a basketball technique with tests for both hands, movement, facing,
and nearby defenders. None of these mechanics or assets are added by DIAG-1.

## MOTION-AI — analysis foundation and follow-up

MOTION-AI-1A is implemented in `server/` and `shared/motion-diagnostics/` without
moving the frontend. Its authenticated preparation endpoint validates a selected
recording and returns bounded, minimized evidence without calling OpenAI. A
server-only Responses adapter and explicit provider readiness CLI establish the
transport boundary. No paid analysis HTTP route or frontend panel is enabled.
See the [Motion Analysis Contract](motion-analysis-contract.md) and
[implementation report](motion-ai-1a.md).

Device names, notes and imported trace strings are untrusted data, never agent
instructions. The future analysis entry accepts a user-selected diagnostic JSON and optional
screenshots/video, not unrestricted access to the running game. A deterministic
validator checks schema, finite values, limits, units, asset/config versions and
known invariant rules before an LLM sees the evidence.

The agent's output must separate:

1. Observations, citing event IDs, revisions/ticks and samples.
2. Rule findings and measurable differences with thresholds/tolerances.
3. Hypotheses and confidence, including missing evidence.
4. A proposed minimal code task and regression/visual acceptance checks.

The agent cannot confirm a root cause from a screenshot alone. It does not modify
production gameplay during analysis. A proposed fix goes through a separate branch,
tests, before/after evidence, human visual review, and PR. MOTION-AI-1B adds
deterministic analytics, 1C connects AI interpretation and 1D adds the frontend.
Credentials and provider requests remain exclusively server-side.

## Acceptance and repeatable comparison

Record the same character/config/build and a controlled initial scenario. Compare
input interpretation and command acceptance first, then measured physical/pose
outcomes. Use tolerances and a controlled browser for repeatable tests. Foot slip,
rotation discontinuity and grip error metrics require appropriate sample rates;
10 Hz samples cannot establish worst-case per-frame rotation jumps. Such a rule
must observe each actual rendered frame and retain bounded findings before it can
make that claim. Visual feel, humor and contact credibility remain human decisions.
