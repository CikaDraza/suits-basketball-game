# SUITS — No Fouls / One full half-court duel

## Fantasy
A weighty, funny, one-hoop basketball brawl between retired Shaq and Chuck, dressed for the boardroom rather than the paint.

## Interpretation / scope decisions
- The locked bootstrap is React + Three.js + Rapier, so ship a playable browser implementation, not Godot source.
- Uploaded files inspected: Shaq-1-770x472.png (Shaq facial structure), l-r-shaquille-oneal-charles-903492533.jpg (black suit/tie versus gray suit/open black collar, bald heads, beard/glasses versus clean-shaven smile), basketball-court-with-wooden-floor-3d-rendering-photo.jpg (dark wood, one red-padded hoop at far end, glass board, slight diagonal camera, near-black surroundings).
- Preserve the no-title-screen bootstrap: play immediately as Shaq against CPU Chuck. Both slots can select either legend in the existing pause overlay's matchup panel. This replaces the requested mandatory first-screen select, avoids a blocking main menu, and keeps replay matchups selectable.
- Single local human versus adaptive CPU. Player 2 gamepad takes over when active; no networking. Triangle/Q = post/spin/double-tap flop; Square/R = raise/contest/release shot. Space is an alias for shoot.
- Fixed orthographic elevated camera reproduces reference composition adjusted to portrait framing; no camera rotation.

## Player verbs
- Joystick / WASD / arrows: heavy camera-relative movement, juke, dribble-hand switch and reach for loose balls.
- Q / Triangle / touch POST: toggle back-down, lateral + Q spin, double-tap flop; mash to rise; inbound pass when ball is out.
- R / Square / Space / touch SHOOT: hold/release at forehead level, ground contest on defense; triple-tap to ball-smash.

## Level scope
One compact half-court, one hoop, two heavy suited legends, CPU offense/defense/rebounding/exhaustion management, no fouls. First to 7 wins; lose when CPU reaches 7. One point inside arc, two beyond arc. Possession changes after baskets; rebound scrambles, interceptable bottom-left inbounds and out-of-bounds recovery. Unlimited rematches. All level layout lives in public/data/levels/level-1.json (pattern A).

## Fun factors
1. Bully the paint — verb: post/spin/shove; feedback: body recoil, impact rings, synthesized bass thud, trash-talk, camera kick. Knob: character mass and post impulse. Task: Duel simulation mass-weighted contact + Character procedural lean + event effects.
2. Forehead release / heavy dunk — verb: hold then release shoot, spin to rim; feedback: green timing indicator, ball arc, net/rim flex, score tick. Knob: perfect release window, contest penalty and dunk range. Task: time-based charge, distance-adaptive hook/push/dunk and moving rim group.
3. Flop and scramble — verb: double Q / mash / reach; feedback: flattened bodies, stun stars, bouncing loose ball, red inbound prompt. Knob: stamina drain/recovery, fumble interval and down recovery. Task: energy-driven movement, seeded clumsy outcomes, flop trip radius, actual Rapier loose ball and interceptable inbound.

## Asset plan
Generated textures:
- public/textures/court-wood.png — seamless warm walnut basketball hardwood boards, restrained grain; 512 square.
- public/textures/basketball.png — orange pebbled basketball surface, subtle dark seam pattern; 512 square.
Generated reference-derived UI portraits:
- public/images/shaq-portrait.png — transparent stylized bald Shaq portrait with broad face, glasses, beard, black suit/tie from uploaded duo.
- public/images/chuck-portrait.png — transparent stylized bald Chuck, rounded clean-shaven face, gray jacket/open black shirt from uploaded duo.
Primitive geometry (permanent): articulated low-poly suited bodies, custom facial features (nose, eyes, beard, glasses, smiles), ball sphere, dark glass hoop, red padded support, rim torus, net line segments, court line ribbons, distant dim benches. Models: none.
Audio: procedural WebAudio thuds, squeaks, dribble taps, swishes and rim clangs; no external audio asset.

## Camera
Fixed orthographic isometric-ish camera [4,11,20], look at paint, adaptive zoom to portrait safe play region; subtle decaying impacts only. Ground never visible from below, no camera collision risk.

## Physics
Rapier at 60Hz, gravity [0,-16,0], fixed thick floor collider, dynamic upright mass-weighted capsules, CCD dynamic loose ball. Scripted flight for shot/inbound readability; contact pushing and knockback augment capsule collisions. Freeze physics when paused.

## Game-data config shape
player: character masses/speeds/heights, energy 100, exhaustion speed, drain/recovery, post/spin and knockback constants.
camera: fixed position/target/zoom/fov and shake.
physics: gravity/timestep/damping and collision sizes.
ai: reaction cadence, shot charge, pursuit/contest/steal and flop probabilities.
shots: forehead timing, dunk range, distance accuracy, contest penalty, flight time.
ball: radius/reach range/dribble/bounce/inbound duration.
score: winTarget 7, close 1 / long 2.
effects: shake/rim/sound and text durations.
rendering: DPR 1, shadows 512, triangles <=60k, calls <=30, colors and light intensities.

## Architecture
Duel.ts owns mutable runtime and state machine; Character.tsx renders bodies and procedural animation. DuelArena.tsx wires RigidBody refs and simulation. gameStore publishes low-frequency HUD snapshots and screen state. Test seam exposes real bodies, ball state, energies, modes, shots, bumps, smash count, flops and measured renderer statistics. Level JSON specifies 3D spawns, floor bounds, hoop geometry and inbound corner.

## Update 2026-11-06 — real models, FIBA court, monster dunk
- Players: rigged GLBs from Basketball_Characters (public/models/shaquille_oneal.glb 2.16 m/150 kg, charles_barkley.glb 1.98 m/138 kg; Mixamo skeleton, face morphs). No body clips ship with them, so src/game/entities/Character.tsx drives the bones procedurally (walk, dribble, set point, release, contest, post, spin, stun, flop, exhausted, dunk/hang) and the face via faceController.ts (blink, gaze at ball, jaw for talk/effort).
- Court + hoop: ported from "3D Basketball Court Setup-handoff" into src/game/court/. Game coordinates ARE the court model's coordinates: x baseline 0 → half-court 14, z sidelines ±7.5, basket at (1.575, 3.05, 0).
- Camera: static perspective view along the court design's compass direction (basket upper-left, half-court toward the bottom edge), low TV angle: camera.height 5.95 m (2 m above the backboard top), horizontalDistance 24.3 m. CameraRig solves FOV + lens shift per screen: backboard top → top of the HUD-free area, near sideline at camera.frameLength (10 m) → bottom, baseline → left edge, zoom capped so the whole three-point arc always fits (config camera.safe holds the phone/desktop HUD margins). Landscape-only on Android; joystick direction derived from the camera yaw.
- Touch: joystick unchanged; PS-style face diamond (△ top post/spin, □ left shoot/contest, ○ right and ✕ bottom reserved/disabled). Hoop: base → Hinge1 (0…-15°) → Hinge2 (0…-45°) → backboard → 3-axis rim (down / left / right), spring-back, verlet net.
- Monster dunk: player glides under the rim, jumps, grabs the front of the rim and hangs; the hang force (mass × g × hangPull × power) bends the rim down, rolls it toward the grip side and flexes both arm hinges, then everything springs back. Missed shots clank the rim edge.
- Scale is now real-world: ball r=0.13, rim 3.05, capsule r=0.42, three-point line 6.75 m (corner 6.6 m).

## Camera — LOCKED (approved 2026-11-06)
Do not change camera.* in game-config.json without the user asking: height 5.95 m, horizontalDistance 24.3 m, design compass direction, frameLength 10 m, three-point-arc zoom cap.

## Basketball logic — slice 1 (inbound + ball holding)
- INBOUND_PHASE after a basket, out of bounds or a 5-second violation: ball parked on the left (near, z = +7.85) sideline at x = 5.2 with a floor ring and a countdown under it (InboundCountdown.tsx).
  POSITIONING 5 s (no pass, both players move/shove) → PASS_WINDOW 5 s (possessor presses Q/△; CPU passes at a random moment, occasionally too late) → 0 = 5-second violation, possession flips, new inbound.
- Pass homes on the receiver and is caught automatically; the defender can intercept it in flight.
- 0.8 s rule: every catch/recovery = two-hand chest hold (ball locked between the palms — Character writes the grip). Direction < 0.8 s = jab step on the pivot foot (no travel; a nearby CPU defender may bite and lunge). Direction held ≥ 0.8 s = dribble starts, player can move. Holding = harder to steal (holdStealFactor). CPU: read → optional jab → drive.
- State snapshots in gameStore: phase (LIVE | INBOUND_PHASE), inbound {stage, remaining, owner}, handling [hold|dribble|none], holdProgress.
- Tunables: game-config.json → inbound.*, handling.*, ai.holdRead/jabChance/jabTap/jabPause.
- Next (slice 2): pivot on Q, swinging the ball around, sluggish movement with gradual acceleration.
