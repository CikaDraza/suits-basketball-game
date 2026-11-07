# Basketball half-court — R3F + Rapier

`npm i three @react-three/fiber @react-three/rapier zustand` (+ `@types/three`)

```tsx
import { Arena } from './basketball';
<Arena />                       // static camera, court, hoop, net, ball
```
Or compose it yourself: `<Court />`, `<BasketballHoop />`, `<Ball />`, `<CameraRig />`, `<Lighting />` inside `<Canvas><Physics>`.

## Coordinates
x: baseline 0 → half-court line 14 · z: sidelines ±7.5 · y up · meters (FIBA).

## Hoop hierarchy
`SegmentA_Base` (fixed body) → `Hinge1_LowerArm` (0…−15°) → `Hinge2_UpperArm` (0…−45°) → `Backboard` → `RimPivot_3Axis` (pitch −0.55…0.03 rad, roll/yaw ±0.22 rad).
The nested `<group>`s are the source of truth. Joint angles are damped springs in `gameStore.hoopRig` (see `hoopRig.ts`), so they always snap back to rest. Collider-only kinematic proxies follow each node, so Rapier collisions match the visuals exactly.

Ball contacts with the rim feed impulses automatically (`onContactForce`). Animation-driven hands/dunks:
```ts
const g = useGameStore.getState();
g.pushHoopImpulse(contactPointWorld, impulseOnRimWorld); // one-off hit
g.hangOnRim(0.6, 1);                                       // player hangs: rim + arms flex, then spring back
```

## Out-of-bounds
Tag bodies with `userData`: ball `{kind:'ball'}`, feet `{kind:'foot', playerId, team}`.
- Ball: out only when it has fully crossed a line AND touches the outside floor collider.
- Player: out the instant a foot touches any boundary line sensor or the floor beyond (only counts for the team in possession).
- Half-court line is a boundary like the baseline and sidelines.
- Violation → `phase:'inbound'`, turnover counted, ball to the other team, placed at the nearest sideline spot (never under the rim, x ≥ 3 m); 10 s to call `completeInbound()` or it's another turnover.
Call `setBallHandler(id, team)` / `setLastTouch(team)` from your gameplay so ownership is correct.
