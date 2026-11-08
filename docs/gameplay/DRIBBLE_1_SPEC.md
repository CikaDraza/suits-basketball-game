# SUITS — DRIBBLE-1

## Objective

Implement correct basketball hand control, camera-relative right-stick interpretation, stationary crossover and protected post-up dribbling.

Repository: `CikaDraza/suits-basketball-game`

Baseline: latest merged `main`, PR #1, commit `e0e9cc5`.

First inspect the actual repository HEAD and existing gameplay documentation.

This is a corrective slice within Gameplay Foundation v2.

Do not implement the full S02 input architecture, S04 balance system or S06 advanced crossover technique yet.

Preserve existing work.

## 1. Existing architecture

Reuse:

- `Duel.ts`
- `ballHandling.ts`
- `handContactPose.ts`
- `dribbleHandTrajectory.ts`
- `gamepadInput.ts`
- `controlBindings.ts`
- `coordinates.ts`
- Existing hand IK and gait systems.

Do not introduce a second ball controller.

Do not replace the existing animation system.

Do not rewrite `Character.tsx`.

Keep the existing physical player body authoritative.

## 2. DRIBBLE-1A — Camera-relative right-stick input

### Current problem

The right stick currently uses only horizontal axis 2.

`HAND_LEFT` and `HAND_RIGHT` are mapped directly to fixed axis signs.

This ignores the vertical component and the character's current orientation.

### Required behavior

Read the right stick as a full two-dimensional vector.

Support:

- Right-stick X.
- Right-stick Y.
- All four cardinal directions.
- Diagonal directions.
- Radial deadzone.
- Gesture activation and release thresholds.
- Neutral-state rearming.

Keep controls remappable in the existing Controls Settings UI.

Do not hardcode axis 2 and 3 throughout the gameplay simulation.

### Coordinate transformation

The skill vector must be interpreted relative to:

1. The gameplay camera.
2. The character's current facing direction.
3. The character's anatomical left/right side.

Use the existing camera-relative movement transform wherever possible.

Determine the player's local right vector from the current body orientation.

Project that direction into the camera-relative stick plane.

Use the resulting vector to determine which anatomical hand the stick gesture selects.

The gesture selects the hand located on the requested visible side of the character.

For example:

When the character faces screen-right and their right hand appears toward the near/bottom side of the screen, a downward right-stick gesture selects the anatomical right hand.

When the character turns, the required stick direction changes accordingly.

Do not map anatomical left/right permanently to stick X signs.

Do not rotate or move the player merely to interpret the right stick.

Capture the orientation at gesture activation so an ongoing turn cannot reverse the meaning of the accepted action.

### Gesture semantics

A gesture toward the opposite hand requests one crossover.

A gesture toward the currently active hand does not request a crossover.

Holding a direction must not repeat the action.

Returning through neutral rearms the gesture.

A new request during an active crossover must follow an explicit queue/reject policy.

Short input events must not be lost between fixed physics ticks.

### Tests

Test Shaq and Chuck facing:

- Screen-left.
- Screen-right.
- Toward the basket.
- Away from the basket.
- Four diagonal orientations.

For every orientation verify:

- Correct anatomical hand.
- Correct camera-relative direction.
- Diagonal input.
- No false activation below deadzone.
- No repeated activation while held.
- No body translation.
- No unintended body rotation.

Use the existing locked gameplay camera.

Do not modify camera configuration.

## 3. DRIBBLE-1B — Persistent dribble-hand ownership

### Current problem

`Duel.ts` retains fallback hand selection from horizontal movement input when `manualHand` is false.

This creates unwanted hand switching.

### Required behavior

Movement input must not select the dribbling hand.

Remove or properly isolate the old movement-based hand-selection behavior for human players.

The hand is selected by a valid skill command and remains selected.

Changing direction, accelerating or starting a drive must not automatically trigger another crossover.

The CPU must also use explicit ball-handling decisions rather than receiving unintended hand changes from locomotion input.

Do not implement new advanced AI behavior in this slice.

### Stationary crossover

When the player is stationary:

- The basketball crosses from one hand to the other.
- The receiving hand takes over.
- The sending hand releases.
- Shoulders and upper body may react slightly.
- The player retains the same physical position.
- The player retains the same facing direction.
- No automatic footstep, sprint or juke impulse occurs.

A new movement command after the crossover may initiate a drive.

### Drive after crossover

Test:

1. Shaq dribbles right.
2. Right-stick gesture transfers the ball left.
3. Crossover completes.
4. Left stick requests movement toward the basket.
5. Shaq accelerates.
6. Basketball remains in the left hand.

Repeat for Chuck and the opposite direction.

### Hand-transfer continuity

Preserve the current ball-bounce phase and crossover interpolation.

Do not teleport the basketball between hands.

Ensure the animated hand follows the correct ball-control phase.

Preserve the existing palm-contact tests.

## 4. DRIBBLE-1C — Protected post-up dribble

### Current problem

The ordinary dribble trajectory is reused during post-up.

The ball can become too close to the torso, and the elbow can move unnaturally behind the body.

### Required behavior

Introduce a separate post-up dribble profile using the existing ball-handling system.

The ball should be:

- Outside the torso/hip silhouette.
- On the selected protective side.
- At a physically reachable distance.
- More protected from the defender than during ordinary dribbling.

The arm should show:

- Natural shoulder opening.
- Elbow flexion and extension.
- Visible forearm movement.
- Wrist movement synchronized with the dribble.
- Correct palm contact.
- No unnatural elbow position behind the torso.

Use real rig measurements.

Do not use arbitrary visual offsets that exceed arm reach.

### Defender awareness

Determine defender position relative to the character.

Use it to adjust protective posture and available spacing.

However:

**Never automatically switch the basketball into the other hand merely because the defender changes position.**

If the current hand is exposed, the player must decide whether to transfer the ball.

Defensive pressure may increase the risk of a steal, but the ball must not silently change ownership.

### Transitions

Verify:

- Upright dribble → post-up dribble.
- Post-up dribble → upright dribble.
- Post-up dribble → crossover.
- Crossover → post-up dribble.
- Post-up → drive.

Preserve the selected hand throughout legal transitions.

## 5. Verification

Extend unit and browser tests.

Required acceptance scenarios:

**SC-D1 — Right-stick relative direction**

Different character orientations select the correct anatomical hand.

**SC-D2 — Stationary crossover**

The character's root/body remains stationary.

The basketball changes hand through the existing crossover path.

**SC-D3 — Crossover followed by drive**

The chosen hand remains unchanged throughout the drive.

**SC-D4 — Movement without crossover**

Left-stick movement and direction reversals do not automatically switch dribbling hands.

**SC-D5 — Protected post-up**

Ball and arm posture remain anatomically plausible while the player backs into a defender.

**SC-D6 — Post-up with defender changing sides**

The protective posture may adapt, but ball-hand ownership does not change automatically.

**SC-D7 — Input lifecycle**

Pause, reset and device disconnect do not leave a stuck gesture or cause an unexpected crossover.

**SC-D8 — Real GLB verification**

Run the scenarios with both Shaq and Chuck.

Check actual shoulder, elbow, wrist and palm positions.

Test relevant behavior at 20/30/60/120 Hz.

Measure, do not merely assert that the models look correct.

## 6. Regression protection

Preserve:

- Upright dribble.
- Existing palm-contact behavior.
- Triple-threat hold.
- Jab step.
- Planted-foot gait.
- Inbound possession.
- Existing shooting.
- Existing keyboard controls.
- Existing gamepad mapping UI.
- Existing CPU behavior.

Run:

- `npm run check`
- `npm run build`
- `npm run test:browser`

Record full results, including any existing or new failures.

Do not claim physical gamepad verification unless the test used an actual connected controller.

## 7. Documentation

Update:

- `docs/gameplay/IMPLEMENTATION_STATUS.md`
- `docs/gameplay/SCENARIO_REGISTRY.md`
- Relevant input and ball-handling documentation.

Create a concise DRIBBLE-1 implementation report.

Document known limitations.

Also record, but do not implement yet, these approved future gamepad mappings:

- PlayStation Cross / Xbox A: inbound pass.
- PlayStation Triangle / Xbox Y: jump, rebound and one-hand block.
- L2 / LT: post-up / protective stance.
- L1 / LB: body contact / bracing.
- Square / Xbox X: shot and shot fake.

These must be introduced in the subsequent controls slice without losing existing gameplay actions.

## 8. Delivery

Implement only DRIBBLE-1A, DRIBBLE-1B and DRIBBLE-1C.

Use an isolated feature branch.

Keep changes small and reviewable.

Do not merge automatically.

At completion, report:

- Root causes.
- Changed files.
- New tests.
- Measured results.
- Visual verification.
- Remaining limitations.
- Full regression results.

Stop for review.

The primary gameplay objective is simple:

**The player chooses which hand controls the basketball. The player separately chooses where the body moves. Neither decision silently overrides the other.**
