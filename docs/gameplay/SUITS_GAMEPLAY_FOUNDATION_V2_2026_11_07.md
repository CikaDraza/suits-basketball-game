# SUITS — THE LAST DANCE

## Gameplay Foundation v2 — Biomechanics, Physics, Basketball Skills & Controls

**Status:** Proposed — awaiting implementation  
**Date:** 2026-11-07  
**Repository:** `CikaDraza/suits-basketball-game`  
**Baseline:** `main` — `465f6e080f60bd6060f9f02b52e5f6dcec9e38d4`

**Canonical document:**

`docs/gameplay/SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md`

---

# 1. PURPOSE AND PRODUCT VISION

SUITS — The Last Dance is a skill-based, physically grounded, humorous 1-on-1 basketball game.

The players are Shaq and Chuck: older, heavy, retired basketball legends wearing suits.

The game must capture the technical intelligence and physical intensity of street basketball.

We prioritize:

1. Basketball knowledge over button mashing.
2. Positioning over raw movement speed.
3. Footwork over exaggerated agility.
4. Timing over automatic success.
5. Body contact over scripted knockback.
6. Genuine ball control over decorative dribbling.
7. Defensive anticipation over artificial reaction bonuses.
8. Realistic movement transitions over abrupt state changes.

The game should be easy to understand but difficult to master.

Characters must feel heavy without feeling unresponsive.

**Core principle:**

> The game reacts immediately to player intent, but the character's body responds according to its momentum, balance, posture, foot placement, contact conditions, and available energy.

A successful technique should provide a physical or positional opportunity, not an automatically successful outcome.

---

# 2. ARCHITECTURAL DECISION

## 2.1 Preserve the existing foundation

Do not rebuild the application.

Preserve:

- React, Three.js and React Three Fiber.
- Rapier physics.
- Zustand.
- Existing game runtime.
- Fixed-step simulation.
- Both rigged GLB characters.
- Existing hand and foot IK.
- Planted-foot locomotion.
- Existing dribble ball controller.
- Inbound passing system.
- Hoop and backboard colliders.
- Flexible rim and net.
- Debug/test harness.

The foundation will evolve through backward-compatible extensions whenever possible.

## 2.2 Extend the foundation through clear responsibilities

Conceptually, the game has these layers:

```text
INPUT SOURCES
  Keyboard / Gamepad / Touch / CPU
                 |
                 v
NORMALIZED PLAYER INTENT
  Move / Drive / Protect / Fake
  Shoot / Contest / Pivot / Reach
                 |
                 v
AUTHORITATIVE GAMEPLAY SIMULATION
  Basketball rules
  Player capabilities
  Technique phases
  Energy and balance
  Ball ownership
                 |
       +---------+---------+
       |                   |
       v                   v
BODY MOTION             BALL CONTROL
  Movement               Hold
  Contact                Dribble
  Balance                Pass
  Footwork               Shot
  Jump/Fall              Loose ball
       |                   |
       +---------+---------+
                 |
                 v
       RAPIER PHYSICS
                 |
                 v
    ANIMATION PRESENTATION
  Body pose / Feet IK / Hand IK
  Animation blending / Faces
                 |
                 v
       GAME FEEDBACK
  Sound / HUD / Camera / Effects
```

This is a separation of responsibilities, not a requirement to create seven new engines or competing state machines.

Extend existing modules first.

Create new modules only when a responsibility can be clearly isolated.

---

# 3. NON-NEGOTIABLE INVARIANTS

The following rules apply to every slice.

## INV-01 — Single authoritative gameplay state

`Duel.ts` and the existing runtime remain authoritative until a reviewed refactor explicitly moves an individual responsibility.

Do not introduce a competing gameplay state machine.

Animation states are derived from gameplay states.

## INV-02 — Fixed-step gameplay

Basketball decisions, physical movement, ball transitions and action timing must remain synchronized with the fixed simulation timestep.

Rendering frequency must not determine game outcomes.

Input timestamps must be normalized into simulation-consumable commands.

## INV-03 — Physical body ownership

The player rigid body owns physical position and velocity.

Animation expresses the resulting movement.

Procedural animation must not arbitrarily move physical bodies through opponents.

Exceptions, such as controlled cinematic actions, must be explicitly defined, bounded and tested.

## INV-04 — Foot ownership

A planted foot has a world-space anchor.

During ordinary gait, foot ownership follows the existing gait system.

During pivoting, the designated pivot foot must remain anchored until a legal movement transition occurs.

## INV-05 — Ball ownership

At any moment, the basketball must have exactly one authoritative movement mode.

Possible conceptual modes:

- HELD
- DRIBBLING
- PASSING
- SHOOT_RELEASE
- FREE_FLIGHT
- LOOSE
- DEAD_BALL

These modes may map onto existing states.

Do not create another independent ball state machine.

A ball must never be moved by two controllers simultaneously.

## INV-06 — Animation ownership

Define ownership of:

- Root/body transform.
- Pelvis.
- Spine and shoulders.
- Upper arms.
- Forearms and hands.
- Fingers.
- Legs.
- Feet.
- Head and facial morphs.

Hand IK, animation clips and procedural poses must compose through an explicit priority/blending policy.

## INV-07 — Energy and recovery

Every demanding physical technique must define:

- Initial energy requirement.
- Energy expenditure.
- Execution duration.
- Recovery duration.
- Interruption rules.
- Failure or degradation conditions.

No expensive technique should be infinitely repeatable without consequences.

## INV-08 — Deterministic verification

Every new gameplay mechanic must have:

- A reproducible scenario.
- A measurable expected outcome.
- Automated checks where feasible.
- A manual visual acceptance procedure.

No slice is accepted because the implementation merely compiles.

## INV-09 — Existing functionality must survive

Every slice must preserve previously accepted mechanics.

A new feature is incomplete if it breaks an earlier accepted feature.

---

# 4. SHARED BODY-MOTION MODEL

Introduce or extend a unified conceptual model for:

```text
PlayerMotionContext

- requestedMovement
- actualVelocity
- locomotionMode
- facingDirection
- bodyBalance
- groundedState
- plantedFeet
- pivotFoot
- contactState
- stamina
- activeTechnique
- recoveryState
```

This does not require these exact field names or a large shared object.

Reuse existing state wherever appropriate.

## 4.1 Movement modes

Support:

**IDLE**

Standing, breathing, weight shifting.

**WALK**

Ordinary controlled movement.

**HUSTLE**

Faster movement toward loose balls, rebounds and open space.

**DRIVE**

Short offensive acceleration when attacking an available lane.

**DEFENSIVE_SHUFFLE**

Controlled lateral/backward defensive movement.

**POST_BACKDOWN**

Low-speed movement while physically engaging a defender.

**PIVOT**

Rotation around a designated planted foot.

**AIRBORNE**

Hop, shot jump, rebound jump or dunk.

**STUMBLE**

Temporary loss of balance after contact.

**DOWN**

Character is on the floor.

**GETTING_UP**

Multi-stage recovery from the floor.

These should be modeled as compatible capabilities or derived states where possible, rather than one enormous enumeration with hundreds of combinations.

## 4.2 Body balance

Introduce a lightweight balance calculation.

Balance depends on:

- Current velocity.
- Requested direction change.
- Planted-foot configuration.
- Body-contact direction.
- Stamina.
- Current technique.
- Recovery from the previous action.

Balance affects:

- Turning speed.
- Defensive recovery.
- Contact resistance.
- Crossover recovery.
- Shooting stability.
- Risk of stumbling.

Avoid random imbalance without a meaningful physical or gameplay trigger.

## 4.3 Acceleration profiles

Movement must support:

- Start acceleration.
- Sustained movement.
- Deceleration.
- Direction reversal.
- Bracing during contact.
- Recovery after movement.

Use configurable character-specific parameters.

Shaq should generally have greater resistance to physical displacement but slower direction changes.

Chuck should generally have better lateral recovery and slightly faster acceleration.

Neither character should move like a current professional NBA guard.

---

# 5. SHARED TECHNIQUE CONTRACT

Every basketball technique must define:

```text
Technique Definition

1. Preconditions
2. Input intent
3. Preparation
4. Weight transfer
5. Primary action
6. Contact/release event
7. Physical outcome
8. Recovery
9. Cancellation/interruption
10. Stamina cost
11. Animation requirements
12. Acceptance tests
```

Examples:

A crossover may have a ball-hand transfer without changing body position.

A jab step may cause the defender to react incorrectly, but must not automatically push the defender away.

A shot fake may change the defender's balance without releasing the basketball.

A post move may create space through contact but must not teleport the defender.

Actions may have configurable preparation, commitment and recovery windows.

Use easing, physically appropriate acceleration profiles and animation blending.

Do not apply one generic ease-in/ease-out curve to every movement.

A jab step, sprint, jump, shot and collision should have different motion profiles.

---

# 6. TECHNIQUE REFERENCE LIBRARY

Create a reference catalog:

`docs/gameplay/ANIMATION_REFERENCE_CATALOG.md`

Primary visual reference:

https://www.youtube.com/@kaka_animator/shorts

For each selected video, document:

- Source URL.
- Technique.
- Relevant time segment.
- Attacker's initial stance.
- Defender's initial stance.
- Pivot foot.
- Lead foot.
- Center-of-mass movement.
- Shoulder/head movement.
- Ball position.
- Release/contact timing.
- Recovery motion.
- Differences required for heavy retired characters.
- Implementation status.

Do not download, redistribute or directly copy protected animation assets without appropriate rights.

Use videos as biomechanical references.

Existing rigged characters and Blender may be used to create original clips.

Prefer a small, consistent collection of animations over numerous incompatible assets.

---

# 7. IMPLEMENTATION ROADMAP

## S00 — Foundation Audit, Contracts and Regression Baseline

**Type:** Architecture and documentation  
**Priority:** Critical  
**Code changes:** Minimal

### Work

Audit the current implementation and document the ownership of:

- Physical player movement.
- Foot planting.
- Pivot logic.
- Hand movement.
- Ball movement.
- Shot state.
- Collision impulses.
- Input interpretation.
- Stamina.
- Animation transitions.

Identify existing duplicate or conflicting responsibilities.

Pay particular attention to:

- `Duel.ts`
- `Character.tsx`
- `gait.ts`
- `posture.ts`
- `handContactPose.ts`
- `ballHandling.ts`
- `movement.ts`
- `DuelArena.tsx`

Do not perform a large refactor.

Record the existing behavior and create a baseline regression suite.

### Required scenarios

- Walk.
- Stop.
- Turn.
- Post-up.
- Dribble.
- Crossover.
- Catch.
- Inbound.
- Shoot.
- Dunk.
- Fall.
- Reset.
- Pause/resume.

Capture reproducible screenshots or video recordings where useful.

### Deliverables

- Foundation architecture document.
- Gameplay action contract.
- Scenario registry.
- Current behavior inventory.
- Regression baseline.
- Confirmed issues list.
- Slice implementation roadmap.

### Acceptance

Existing tests run and results are recorded.

Known failures are distinguished from new regressions.

No existing functionality is deliberately removed.

---

## S01 — Dribble Hand Motion and Contact Repair

**Priority:** Critical  
**Dependency:** S00

### Problem

The active dribbling hand does not visibly follow the complete bounce cycle.

### Work

Repair the relationship between:

- Basketball bounce phase.
- Active palm.
- Shoulder movement.
- Elbow extension.
- Wrist orientation.
- Ball contact.
- Hand recovery.

A realistic dribble cycle should include:

1. Hand prepares above the basketball.
2. Palm contacts the upper surface of the ball.
3. Arm extends downward and pushes the ball.
4. Ball separates from the palm.
5. Hand recovers upward.
6. Hand prepares for the next bounce.

The arm must not remain at a fixed height.

The palm must not remain glued to the ball during the entire trajectory.

The elbow must visibly flex and extend.

The opposite arm should provide natural balance or protect the ball.

### Tests

Test the complete dribble cycle for both characters.

Verify:

- Hand vertical displacement.
- Wrist/elbow movement.
- Correct contact phase.
- No persistent hand penetration.
- No ball teleportation.
- No regression of crossover hand ownership.
- No regression at 20/30/60/120 Hz.

### Acceptance

Both characters visibly dribble with an animated arm.

The contact between palm and basketball is believable throughout the cycle.

---

## S02 — Unified Gamepad and Input Intent System

**Priority:** Critical  
**Dependency:** S00

### Work

Introduce normalized input handling.

Inputs:

- Keyboard.
- PlayStation-compatible gamepad.
- Xbox-compatible gamepad.
- Touch controls.
- CPU controller.

Support:

- Left analog stick.
- Right analog stick.
- Analog triggers.
- Button press/release.
- Held buttons.
- Flick gestures.
- Combination gestures.
- Controller connection/disconnection.

Use controller mappings instead of hardcoded assumptions scattered across gameplay code.

### Initial control scheme

| Control     | Intent                                     |
| ----------- | ------------------------------------------ |
| Left stick  | Move                                       |
| Right stick | Basketball skill / defensive arm direction |
| Square      | Shoot / Contest                            |
| Triangle    | Pivot / Post                               |
| Circle      | Reach / Steal                              |
| Cross       | Jump / Rebound                             |
| L1          | Body contact / Brace                       |
| L2          | Protect ball / Defensive stance            |
| R1          | Hustle / Drive                             |
| Options     | Pause                                      |

Exact keyboard and mobile equivalents must be documented.

Context determines the action, but identical inputs must not produce unpredictable behavior.

### Tests

- Controller calibration.
- Radial deadzone.
- Direction recognition.
- Flick versus hold.
- Correct button edges.
- No repeated commands from a single gesture.
- Two-controller support.
- CPU fallback.
- Pause/reset.
- Device disconnection.
- Keyboard and touch compatibility.

### Acceptance

One connected gamepad can control Player 1 throughout a duel.

A second gamepad can control Player 2 without conflicting ownership.

All primary actions are exposed through normalized gameplay intents.

---

## S03 — Heavy Locomotion, Acceleration and Progressive Stamina

**Priority:** Critical  
**Dependency:** S02

### Work

Extend the current movement controller.

Implement:

- Walk.
- Hustle.
- Drive.
- Heavy acceleration.
- Directional deceleration.
- Stopping.
- Turning.
- Backpedaling.
- Stamina-based movement degradation.

Character movement must be responsive but physically heavy.

A full stick input must not immediately produce maximum speed.

A reversal must require braking and changing support.

### Special behavior

When a defender is beaten, the attacker should be able to accelerate into the open driving lane.

When a loose ball is available, both players can hustle toward it.

Players should not remain limited to ordinary walking speed in these situations.

### Animation

Preserve planted-foot gait.

Introduce different stride and trunk behaviors for walking and hustle.

### Stamina

Replace abrupt all-or-nothing movement exhaustion with progressive capability degradation.

Exhausted characters should breathe heavily and take longer to recover.

Breathing animation must not create unintended movement of the physical character.

### Tests

- Speed curves.
- Braking distance.
- Direction reversal.
- Stamina drain/recovery.
- Different character movement profiles.
- Grounded feet.
- No walking animation when blocked.

### Acceptance

Shaq and Chuck visibly and mechanically feel different.

Both can change tempo.

Their bodies remain heavy even when accelerating.

---

## S04 — Body Contact, Defensive Resistance and Balance

**Priority:** Critical  
**Dependency:** S03

### Work

Improve player-to-player physical contact.

Introduce meaningful distinctions between:

- Light contact.
- Body-up defense.
- Post-up pressure.
- Bracing.
- Strong body collision.
- Defensive overcommitment.
- Stumbling.
- Blow-by.

Investigate the current Rapier contact configuration and velocity overrides.

Do not assume increasing friction alone is sufficient.

### Contact behavior

A correctly positioned defender must stop or meaningfully resist a direct drive.

The attacker can:

- Change direction.
- Back down.
- Pivot.
- Pull away.
- Attempt another move.

A defender who leans or steps in the wrong direction may lose the driving lane.

### Balance consequences

Contact can change:

- Momentum.
- Stance.
- Body lean.
- Available acceleration.
- Recovery duration.

Avoid automatic falls from ordinary contact.

### Tests

- Front collision.
- Side collision.
- Post-up contact.
- Bracing.
- Defender beaten laterally.
- Different masses.
- Low stamina.
- No physics explosions.
- No tunneling or teleporting through the defender.

### Acceptance

Players visibly lean against one another.

Defensive position matters.

Mass creates resistance without making either character immovable.

---

## S05 — Triple Threat, Pivot Foot and Jab Step

**Priority:** Critical  
**Dependency:** S04

### Work

Implement a complete triple-threat system after catching the basketball.

### Triple-threat posture

- Knees partially bent.
- Trunk stable.
- Shoulders ready.
- Head oriented toward the defender.
- Ball protected at hip or chest level.
- Both hands involved in ball protection.

### Pivot foot

On catching the ball and establishing a legal stance, designate a pivot foot.

The pivot foot must retain its world-space floor anchor.

Allow controlled rotation around that foot.

The other foot can step and return.

### Jab step

- Lead foot initiates the fake.
- Torso and shoulders sell the movement.
- Head follows the body action.
- Ball remains protected.
- Pivot foot stays planted.
- Lead foot returns before another action.

The jab must not automatically move the defender.

### Defensive reaction

The defender may:

- Hold position.
- Lean toward the fake.
- Step toward the wrong side.
- Recover.
- Expose a driving lane.

Reaction depends on input, timing, balance and CPU behavior.

### Advanced fake preparation

Support future combinations of:

- Jab left.
- Return.
- Pivot right.
- Shot fake.
- Drive.
- Step-back.

### Tests

- Pivot foot stability.
- Full body rotation.
- Correct lead-foot movement.
- No traveling.
- Correct ball protection.
- Defender reaction.
- Recovery duration.
- Stamina consumption.

### Acceptance

A player can perform a convincing jab step without accidentally starting a dribble or moving the pivot foot.

---

## S06 — Crossover and Defensive Overcommitment

**Priority:** Critical  
**Dependency:** S05

### Work

Extend the existing crossover.

A crossover is primarily a controlled transfer of the basketball between hands.

It must not automatically trigger:

- A large lateral jump.
- A fast sprint.
- A guaranteed defender stumble.
- A guaranteed driving lane.

### Technique phases

1. Controlled dribble.
2. Prepare the transfer.
3. Lower the basketball.
4. Push the ball across the body.
5. Transfer control to the opposite hand.
6. Recover the ball-control stance.
7. Optionally begin a drive.

### Defender interaction

Allow the defender to direct the reaching arm toward the ball using the right stick.

The defender may lower their body and shift weight toward the exposed ball.

If the attacker transfers the ball before the defender recovers, the defender may become off-balance.

The attacker can then choose the driving direction.

### Risk

An exhausted attacker executing an aggressive crossover under pressure may mishandle the ball.

Use meaningful gameplay conditions instead of arbitrary failure.

### Tests

- Left-to-right transfer.
- Right-to-left transfer.
- Defender reaching correctly.
- Defender overcommitting.
- No automatic lateral movement.
- Stamina effects.
- Full hand/ball contact cycle.
- No ball snapping between hands.

### Acceptance

A crossover can create an advantage through defensive anticipation and timing.

It never guarantees a successful drive.

---

## S07 — Inbound Pass, Lob Punishment and Loose-Ball Recovery

**Priority:** High  
**Dependency:** S03, S04

### Preserve

The existing:

- 5-second positioning window.
- 5-second passing window.
- Physical chest passing.
- Lob passing.
- Defensive interception.
- Out-of-bounds logic.

### Problem

A defender can approach the inbound source too aggressively.

The passing system must recognize when the defender abandons receiver coverage.

### Work

Improve inbound decision-making.

If the defender crowds the inbound source and leaves open space behind:

- Evaluate the defender's position.
- Identify the receiver's valid movement direction.
- Predict a reachable future reception area.
- Consider a lob over the defender.
- Release a physically simulated pass.

Do not automatically home the ball into the receiver's hands.

The receiver must physically reach the pass.

### Receiver movement

Introduce a short hustle acceleration while chasing an incoming pass.

Allow the player to:

- Accelerate.
- Reach toward the ball.
- Lower the body.
- Catch it if reachable.
- Pick it up after a bounce if missed.

### Risk

A badly executed lob may:

- Hit the board.
- Hit the rim.
- Travel out of bounds.
- Be intercepted.
- Become a loose ball.

### Tests

- Normal chest pass.
- Defender crowding source.
- Defender fronting receiver.
- Correct lob response.
- Reachable predicted target.
- Unreachable lead pass.
- Interception.
- Missed catch and physical pickup.
- No automatic possession.
- Clock expiration.

### Acceptance

Crowding the inbound source creates a realistic opportunity for a lob.

Successful reception still requires movement and timing.

---

## S08 — Shooting Biomechanics and Release Timing

**Priority:** Critical  
**Dependency:** S01, S05

### Work

Implement a proper shooting motion for both characters.

The shot must have:

1. Gather.
2. Set position.
3. Ball elevation.
4. Shoulder/elbow extension.
5. Right-hand release.
6. Wrist follow-through.
7. Body recovery.

The left hand supports the ball during preparation.

The right hand controls the final release.

The basketball must visibly leave the right hand.

### Character differences

Allow configurable Shaq and Chuck shooting styles.

Different:

- Elbow position.
- Release speed.
- Set point.
- Body posture.
- Follow-through.
- Shot consistency.

Do not force identical shooting motions onto both characters.

### Shooting power model

Implement the requested inverted hold-time behavior as a configurable game design rule.

Proposed behavior:

**Early committed release**

- Stronger, quicker throw.
- Lower precision.
- Greater risk of overshooting.

**Optimal release window**

- Controlled power.
- Better precision.
- More stable body mechanics.

**Late release**

- Slower, weaker throw.
- Risk of undershooting.
- Possible contact with front rim or failure to reach the hoop.

The exact curve must be calibrated.

### Important distinction

A quick tap used for a pump fake must not automatically become a strong shot.

Separate:

- Fake/cancellation window.
- Committed shot.
- Release power selection.
- Actual animation release event.

Do not teleport the ball out of the hand when the button is released.

The button release determines the shot command and its parameters.

The ball leaves the hand at the corresponding animation event.

### Advanced shot fake

Allow:

- Start shot preparation.
- Shift toward a direction.
- Cancel before commitment.
- Recover onto the pivot foot.
- Change direction.
- Start a real shot or drive.

The pivot foot and ball possession rules must remain valid.

### Tests

- Two-hand preparation.
- Right-hand release.
- Wrist follow-through.
- Short/optimal/long hold.
- Cancelled shot fake.
- Pivot after fake.
- No premature ball release.
- No duplicated shooting action.

### Acceptance

Both characters have recognizable, natural shooting motions.

Shot timing is controllable and meaningfully affects release quality.

---

## S09 — Physical Shooting, Bank Shots, Rim and Net

**Priority:** Critical  
**Dependency:** S08

### Work

Replace predetermined made/missed shot paths with a physically resolved release.

The basketball receives a calculated initial velocity.

The physics simulation determines subsequent movement and collisions.

Shot parameters include:

- Release position.
- Release direction.
- Initial velocity.
- Arc.
- Shot power.
- Timing error.
- Body balance.
- Defensive pressure.
- Stamina.

Use deterministic, bounded release-error modeling.

Do not predetermine whether the shot is a make.

### Scoring

A valid basket must be detected from the ball crossing the rim plane downward through the scoring region.

Reject invalid crossings.

Prevent duplicate scoring.

### Bank shots

Implement bank-shot target selection based on:

- Shooter position.
- Distance.
- Angle relative to the backboard.
- Intended shooting action.

The ball must physically contact the backboard.

Do not simply award a higher make percentage.

### Rim and net

Preserve the existing flexible structure and Verlet net.

Synchronize the actual ball trajectory with:

- Backboard contact.
- Rim contact.
- Rim response.
- Net deformation.
- Ball exit.

### Tests

- Direct made shot.
- Front-rim miss.
- Back-rim miss.
- Side-rim bounce.
- Bank shot.
- Bank-shot miss.
- Airball.
- Multiple contacts.
- Correct downward scoring.
- No score on upward crossing.
- No duplicate points.
- Correct rebound state.

### Acceptance

A basket is earned by the physical trajectory of the basketball.

The same release conditions produce reproducible results.

---

## S10 — Post-Up, Drop Step and Hook

**Priority:** High  
**Dependency:** S04, S05, S09

### Post-up

The attacker:

- Turns their back toward the defender.
- Lowers the center of mass.
- Establishes physical contact.
- Protects the basketball.
- Advances through controlled steps and weight transfer.

The defender can brace.

### Drop step

- Establish pivot.
- Rotate the hips.
- Move the free foot around the defender.
- Protect the ball.
- Create a path toward the hoop.

No teleportation.

### Hook shot

- Rotate shoulder and trunk.
- Protect the ball with the non-shooting side.
- Raise the shooting arm.
- Release above the defender's reach.
- Recover balance after release.

Support compact and high hook variations where mechanically appropriate.

### Tests

- Defender resistance.
- Correct pivot.
- No traveling.
- Protected ball position.
- Hook release height.
- Contest response.
- Stamina and recovery.

### Acceptance

Shaq's strength creates a meaningful post-up advantage, but Chuck can defend through positioning and timing.

---

## S11 — Floater, Step-Back and Fadeaway

**Priority:** High  
**Dependency:** S08, S09, S10

### Floater

- Begin from controlled forward motion.
- Gather the basketball.
- Perform a legal finishing step sequence.
- Execute a small, heavy takeoff.
- Raise the shooting arm.
- Release a high-arc shot.

Stamina affects the jump and shot stability.

### Step-back

Implement the sequence:

1. Offensive drive.
2. Body contact.
3. Player requests backward movement.
4. Transfer momentum.
5. Establish separation.
6. Rotate torso toward hoop.
7. Prepare and release shot.
8. Recover balance.

Body contact alone must not automatically create separation.

### Fadeaway

Allow a controlled backward body lean and movement during shot execution.

The release direction must remain independent of the character's backward motion, while the actual shot trajectory reflects the release velocity and body state.

### Tests

- Forward momentum.
- Controlled deceleration.
- Contact-to-step-back.
- Correct feet.
- Body lean.
- Release position.
- Shot accuracy degradation under poor balance.
- Recovery after landing.

### Acceptance

The defender can stop a drive, but the attacker can use the contact to create a realistic step-back opportunity.

---

## S12 — Defensive Verticality, Jump Contest and Rebounding

**Priority:** High  
**Dependency:** S04, S09

### Hands-up defense

When contesting a shot:

- Defender raises the arms in front of the head.
- Palms face the ball or shooter.
- Hands remain relatively close together for a vertical contest.
- Elbows and shoulders retain anatomically plausible positions.

Allow controlled right-stick targeting of the defensive arms.

Do not instantly rotate the arms into position.

### Vertical jump

Introduce a short, controlled defensive jump.

Differentiate:

- Grounded hands-up contest.
- Short vertical contest.
- Active block attempt.

The block should require the ball to intersect a plausible reach region at the correct time.

### Rebounding

Allow small hops and appropriate limited jumps near the rim.

A tiny 0.02 m hop can be used for certain balance or reach reactions.

A genuine rebound attempt may require more vertical movement, depending on position and player capabilities.

Rebound success depends on:

- Ball trajectory.
- Position.
- Timing.
- Reach.
- Body balance.
- Contact.
- Stamina.

### Tests

- Two-hand vertical contest.
- Right-stick arm targeting.
- Short block jump.
- Block timing.
- Missed block.
- Rebound jump.
- Ball recovery.
- No automatic possession.

### Acceptance

Defense is active and skill-based.

Correct timing can block or disrupt a shot.

---

## S13 — Signature Monster Dunk and Rim Hang

**Priority:** High  
**Dependency:** S09, S12

### Work

Repair the current dunk animation.

The arms must not remain separated beside the rim.

### Phases

1. Approach.
2. Gather.
3. Takeoff.
4. Ball elevation.
5. Rim attack.
6. Physical contact.
7. Finger closure and rim grip.
8. Controlled hang.
9. Pendulum-like body swing.
10. Release.
11. Landing and recovery.

### Rim grip

Use the actual animated rim position.

Calculate hand targets in rim-local coordinates.

The palms and fingers must align with the grip region.

Do not independently guess hand positions from the player root.

Respect arm reach and anatomical joint limits.

### Body suspension

During the hang:

- Hands remain visually attached to the rim.
- The body reacts to gravity and momentum.
- The rim bends under the effective load.
- The body may swing.
- The player releases and lands.

The hoop and player animation must remain synchronized.

### Balance

Monster dunks should be spectacular but not ordinary actions available without effort.

They may require sufficient stamina, positioning and approach conditions.

### Tests

- Both hands contact the rim.
- Fingers close around the grip region.
- No arm stretching.
- No hand detachment during rim movement.
- Controlled swing.
- Valid release.
- Correct landing.
- No physics explosion.
- No duplicate score.

### Acceptance

The dunk resembles a complete physical action rather than a static character animation beside a bending rim.

---

## S14 — Flop, Fall, Get-Up, Leg Grab and Ball Smash

**Priority:** Medium  
**Dependency:** S04, S12

### Flop and falling

Distinguish:

- Deliberate flop.
- Backward loss of balance.
- Forward stumble.
- Side fall.
- Contact-induced fall.

The falling direction should depend on body momentum, contact and technique.

A backward flop must not randomly become a face-first fall.

### Ground recovery

Implement stages:

1. Lying on the floor.
2. Turning or bracing.
3. Supporting with arms.
4. Moving onto knees.
5. Rising.
6. Recovering balance.

Repeated input may assist recovery but must not instantly teleport the player upright.

### Leg grab

While down, a player may attempt a short reach toward a nearby opponent's leg.

This is a contextual, intentionally exaggerated no-fouls game mechanic.

It must:

- Require correct distance.
- Have a visible reach animation.
- Be limited by timing.
- Consume energy.
- Have a cooldown.
- Not guarantee a trip.
- Allow a stronger, balanced opponent to resist.

### Ball smash

Preserve the existing special concept.

A rapid triple-shoot gesture may trigger a close-range ball strike, but must not accidentally fire ordinary shots during gesture recognition.

Evaluate the control conflict with quick-release shooting.

If necessary, provide a dedicated combination while preserving the intended mechanic.

The recipient may:

- Recoil.
- Protect the stomach or face.
- Lose balance.
- Recover.

A smash must not automatically knock down a balanced defender.

### Tests

- Backward flop.
- Forward stumble.
- Side fall.
- Multi-stage recovery.
- Limited leg reach.
- Failed trip.
- Successful imbalance.
- Ball smash.
- No repeated free actions.
- No collision instability.

### Acceptance

Falls and recovery are readable, physical and entertaining.

The controls remain predictable.

---

## S15 — Opening Shoot-Out and Match Lifecycle

**Priority:** High  
**Dependency:** S09

### Work

Introduce an opening three-point shoot-out.

The shoot-out must use the completed shooting mechanics.

### Proposed rules

- Player 1 and Player 2 alternate three-point attempts.
- Each player receives one attempt per round.
- If one scores and the other misses, the scorer wins opening possession.
- If both score or both miss, continue to another round.
- CPU uses the same shooting constraints as a human player.

### Transition

After the winner is established:

- Clear temporary shoot-out state.
- Preserve selected characters.
- Reset the relevant ball and movement state.
- Enter the existing inbound phase.
- Start the existing 5 + 5 second sequence.

### New Duel

The New Duel action must reset:

- Score.
- Energy.
- Balance.
- Ball state.
- Player positions.
- Temporary movement.
- Pending actions.
- Technique recovery.
- Physics velocities.
- Input states.
- Shot state.
- Inbound state.
- Hoop deformation.
- Match timers.

Then begin a new shoot-out.

### Tests

- Player 1 wins.
- CPU wins.
- Both score.
- Both miss.
- Correct possession.
- Correct inbound transition.
- Reset during shoot-out.
- Reset during live game.
- Reset during fall/dunk.
- No stale commands or physics state.

### Acceptance

The opening three-point shoot-out reliably demonstrates the actual shooting system and transitions into a complete duel.

---

## S16 — CPU Intelligence, Animation Polish, Performance and Final Gameplay Balance

**Priority:** High  
**Dependency:** Accepted core gameplay slices

### CPU

CPU must operate through the same normalized gameplay actions as human players.

It should understand:

- Defensive position.
- Ball exposure.
- Good shooting opportunities.
- Post advantages.
- Jab-step reactions.
- Crossover threats.
- Open driving lanes.
- Loose-ball recovery.
- Stamina management.
- Rebounding position.

Difficulty should affect reaction, decision-making and execution quality.

Do not give the CPU illegal movement speed or automatic ball possession.

### Animation polish

Improve transitions between all accepted techniques.

Use original animation clips where they provide a measurable quality benefit.

Blend clips with procedural motion and IK.

Preserve foot and ball contacts.

### Performance

Optimize:

- Character model size.
- Texture memory.
- Draw calls.
- Animation updates.
- Physics allocations.
- Browser mobile performance.

Do not add heavy post-processing merely to increase visual detail.

### Gameplay balance

Evaluate:

- Average possession duration.
- Shooting success by distance and release quality.
- Stamina consumption.
- Crossover effectiveness.
- Defensive recovery.
- Frequency of falls.
- Offensive/defensive fairness.
- CPU difficulty.
- Keyboard/gamepad/mobile parity.

### Acceptance

The full game remains playable, understandable, competitive and performant.

---

# 8. REQUIRED SCENARIO REGISTRY

Create:

`docs/gameplay/SCENARIO_REGISTRY.md`

Each scenario must have:

- Unique ID.
- Starting positions.
- Player possession.
- Player energy.
- Input sequence.
- Expected gameplay events.
- Expected body/ball state.
- Visual verification.
- Automated test reference.
- Acceptance status.

Initial scenarios:

| ID     | Scenario                    |
| ------ | --------------------------- |
| SC-001 | Standing dribble            |
| SC-002 | Walking dribble             |
| SC-003 | Crossover while stationary  |
| SC-004 | Crossover during movement   |
| SC-005 | Walk to hustle              |
| SC-006 | Acceleration and heavy stop |
| SC-007 | Defensive lateral shuffle   |
| SC-008 | Body-up collision           |
| SC-009 | Post-up resistance          |
| SC-010 | Triple threat               |
| SC-011 | Jab step and recovery       |
| SC-012 | Defender overcommitment     |
| SC-013 | Inbound lob over defender   |
| SC-014 | Running to catch a pass     |
| SC-015 | Normal jump shot            |
| SC-016 | Shot fake and pivot         |
| SC-017 | Bank shot                   |
| SC-018 | Hook shot                   |
| SC-019 | Running floater             |
| SC-020 | Contact step-back           |
| SC-021 | Vertical contest            |
| SC-022 | Rebound jump                |
| SC-023 | Monster dunk and hang       |
| SC-024 | Backward flop               |
| SC-025 | Multi-stage recovery        |
| SC-026 | Leg-grab attempt            |
| SC-027 | Ball smash                  |
| SC-028 | Opening shoot-out           |
| SC-029 | New Duel reset              |
| SC-030 | Exhaustion and recovery     |

A scenario becomes `Verified` only when its acceptance criteria have been checked.

Do not mark scenarios complete merely because their implementation exists.

---

# 9. GAMEPLAY TUNING AND DIAGNOSTICS

Create a development-only Gameplay Tuning Mode.

Expose:

```text
Character:
Gameplay phase:
Active technique:
Technique phase:
Locomotion mode:
Requested speed:
Actual speed:
Acceleration:
Stamina:
Balance:
Pivot foot:
Ground contact:
Contact direction:
Active dribble hand:
Dribble phase:
Ball mode:
Shot timing:
Shot release velocity:
Right-stick gesture:
```

Provide visualization tools for:

- Player colliders.
- Contact normals.
- Foot anchors.
- Hand targets.
- Ball trajectory.
- Shot release point.
- Rim plane.
- Defensive reach.
- Active technique phases.

Do not render or publish these diagnostics through high-frequency React state updates.

Reuse the existing debug/test infrastructure.

### Tuning configuration

Store gameplay tuning values in the existing configuration structure.

Separate:

- Physical constants.
- Character movement.
- Stamina.
- Basketball technique tuning.
- Input thresholds.
- Animation timing.
- Shot behavior.
- AI behavior.

Avoid unexplained magic numbers.

---

# 10. QUALITY AND REGRESSION POLICY

Each implementation slice must follow this process:

## Step 1 — Inspect

Read current implementation and related tests.

Identify the authoritative state and affected systems.

## Step 2 — Define

Document the technique or mechanic.

Specify state transitions, inputs, physics effects, animations and acceptance criteria.

## Step 3 — Implement

Use the smallest coherent change.

Avoid unrelated refactors.

## Step 4 — Test

Run relevant unit and integration tests.

Add deterministic regression coverage.

Run the existing check/build/browser commands.

## Step 5 — Visual verification

Inspect both characters.

Use front, side and gameplay camera views where useful.

Record failures rather than hiding them.

## Step 6 — Review

Check that earlier accepted scenarios still behave correctly.

Verify CPU and human controls where applicable.

## Step 7 — Document

Update:

- Slice status.
- Tests.
- Configuration changes.
- Measured results.
- Known limitations.
- Next dependencies.

## Step 8 — Commit

Use an isolated feature branch.

Do not push directly to `main`.

Keep each slice independently reviewable.

Do not start another slice before the current one has passed verification and been accepted.

---

# 11. DEFINITION OF DONE

A slice is complete only when:

- Its gameplay behavior is implemented.
- Its animation behavior is implemented.
- Its physics behavior is consistent.
- Inputs behave correctly.
- Stamina and recovery rules are respected.
- New automated tests pass.
- Previously accepted relevant tests pass.
- Visual verification has been performed.
- No significant unexplained regression remains.
- Documentation reflects the real implementation.
- Changes are committed on the appropriate branch.

Use these statuses:

`Planned → In Progress → Implemented → Automated Verified → Visual Verified → Accepted`

If a test fails, record the failure.

If visual verification is unavailable, explicitly mark it as pending.

Never silently promote an unverified slice to Accepted.

---

# 12. FIRST CODEX TASK — DOCUMENTATION AND BASELINE ONLY

Start with S00.

Do not implement S01–S16 yet.

Your immediate responsibilities:

1. Inspect the repository at the current `main` HEAD.
2. Compare the existing implementation with this plan.
3. Identify contradictions, missing dependencies and existing functionality.
4. Preserve this proposal as the canonical gameplay plan.
5. Create the scenario registry and implementation status tracker.
6. Record current test results.
7. Identify the smallest required foundation changes.
8. Provide a concrete implementation proposal for S01.
9. Record which existing files should be reused or extended.
10. Stop before implementing gameplay changes.

Create:

```text
docs/gameplay/
  SUITS_GAMEPLAY_FOUNDATION_V2_2026_11_07.md
  SCENARIO_REGISTRY.md
  INPUT_CONTRACT.md
  ANIMATION_REFERENCE_CATALOG.md
  GAMEPLAY_TUNING.md
  IMPLEMENTATION_STATUS.md
```

Do not duplicate existing documentation unnecessarily.

Link the new canonical documents from the existing `plan.md`.

Keep the implementation tracker authoritative for progress.

The existing application must remain functional.

**Final objective:**

Create a technically maintainable, mechanically deep 1-on-1 basketball game where physical weight, player skill, ball handling, defensive anticipation, footwork and shooting timing determine the outcome.

The implementation must grow through individually verified basketball situations without destabilizing previously accepted gameplay.
