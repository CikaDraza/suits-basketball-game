# Balancing — SUITS / No Fouls

## Changes
- camera.visibleWidth: 19 → 17.6
  Why: both portrait UX runs showed too much unused dark space and small figures; an 8% tighter fixed projection improves face/pose readability while retaining corner-body margins and the uploaded reference's diagonal angle.
- player.postSpeed: 0.68 → 0.74
  Why: headroom-for-skill heuristic; post movement becomes 9% more responsive without changing slow grounded base speeds, mass ratios or shove energy cost.
- shots.resetDelay: 1.1 → 0.9 seconds
  Why: score/possession turnover had idle downtime after a basket; shorten the reset but preserve a visible swish/rim reaction and opponent possession feedback.

## Checklist, in order
1. First5s PASS: starts in play .5/-0.6 versus .2/-2.2; first Q+W produced bumps in <2s. No onboarding delay.
2. First failure PASS: no instant loss; CPU autonomous test scored7 over about35s with repeated gifted possessions. Human can contest/block/flop, recover or rest; no lives system because this is a points duel.
3. Difficulty ramp deliberate exception: one fixed 1v1 match, not endless waves. Rising pressure comes from score race, exhaustion and possession swaps; do not artificially inflate opponent power after a minute.
4. Score growth PASS: near-rim input takes .68s charge +1.05s flight; alternating possessions approximately4–5s, now less downtime. Seven real shots produced win.
5. Reward variance PASS: one inside / two outside, Shaq power versus Chuck mid-range accuracy; no added progression/currencies.
6. Punishment recoverable PASS: stun1.2s, flop automatic3.5s but mash reduced remaining recovery2.78s. Energy restored30.3 in1.25s; no permanently dead bodies. Out of scope: additional invulnerability/glow system, unnecessary for the no-fouls physical trap prototype.
7. Skill headroom PASS after postSpeed tweak: base Shaq2.65 and Chuck3.1 are intentionally heavy rather than twitchy; lateral spin5.2 costs20 energy. 0.26s green window forgiving open, .38 contest penalty strict under pressure. Same seed300: open1, contested0.

## Physics / rendering
Keep gravity-16, floor thickness.4, CCD loose ball, mass155/115, DPR1 and one512px shadow map. Phone raw49–54fps,10026triangles,19calls. 720×1280 SwiftShader screenshot run24fps is environment-limited; do not fake metrics or raise DPR. No new rendering systems.

## Scope
- Browser stack rather than Godot source, per locked runtime.
- Matchup selection is in timeout instead of a mandatory opening menu, preserving immediate gameplay.
- Shots/inbounds and rim wobble are scripted readability-first, with real Rapier contact and loose rebounds rather than full basketball/net FEM simulation.

## Tactical inbound capture — 2026-11-07
- Authoritative tuning remains in `src/game/data/game-config.json`, section `inbound.passing`.
- Open chest pass: 17 m/s horizontal target speed, flight clamped to 0.18–0.85 s; gravity is compensated at release.
- Denial: defender projects inside the passing lane (5–95%), within 0.75 m of the lane and 2.4 m of the receiver. Lob apex rises 2.35 m above its endpoints with at least 0.6 m defender clearance.
- Deep-paint lob risk: radius 2 m, covering the existing 1.85 m dunk range. Aim shifts 0.25 m beyond the backboard at rim height +0.12 m. Actual board/rim contact decides the rebound. A receiver cutting into this zone after release also loses the automatic catch.
- Active R interception: 0.25 s from the new press, 0.65 m reach plus ball radius; swept 3D path, bounded by character height +0.3 m. Holding R does not renew the window.
- Receiver hand catch radius: 0.7 m; missed-flight grace: 0.4 s. Neither elapsed flight time nor horizontal proximity alone grants possession.
- Preserve the left-sideline spot, 5+5 inbound timing and 0.8 s hold-to-dribble timing. Inbounds now use physical Rapier trajectories; shots retain their existing scripted flight.

## Post movement / animation capture — 2026-11-07
- Animation tuning is in `src/game/data/game-config.json`, section `animation`.
- Normal step distance 0.66 m, post shuffle 0.44 m. Phase advances from actual body travel, so pushing against a stationary defender does not make the feet run in place.
- Normal foot lift 0.12 m, post foot lift 0.065 m; support-foot motion cancels translation along the actual forward/backward/lateral path.
- Contact-arm hysteresis is 0.16 m around the spine; switch sides only when the defender moves clearly to the other side.
- Hands relax off-ball. Two-hand catching prepares within 1.8 m of the incoming pass. Q toggles the seal during positioning and immediately requests a pass during the existing pass window.
- Existing player speeds, body mass, shove impulses, 5+5 inbound timing and 0.8 s hold-to-dribble timing are unchanged.

## Held-ball input update — 2026-11-07
- This supersedes the earlier 0.8 s hold-to-dribble rule: `handling.jabTapWindow` is 0.1 s.
- Jab starts on release of a short tap. Continuing movement goes directly to dribble, without playing a jab first. Event timing preserves taps between render/physics frames.
- CPU fake tap is 0.05 s so it remains a tap under the new threshold; player movement speeds are unchanged.
- Post two-hand IK lowers the wrist center 0.13 × character height below the shoulder midpoint and places each wrist ball radius +0.02 m to its side. The elbow bend pole stays outward.

## Imported Shaq defense — 2026-11-13
- `animation.importedDefense`: 0.3 s entry/exit blend and lower-body blend rate 12/s preserve readable transitions while returning moving feet to the existing gait/IK.
