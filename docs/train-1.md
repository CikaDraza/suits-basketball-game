# TRAIN-1 — Training foundation and Free Movement

Branch: `feat/train-1-free-movement`, based on `origin/staging` at `bd5ba78`.

## Architecture and scope

`gameStore.session` is the single session selection. `GameSession` describes Duel,
Free Movement, Solo Practice, and Offense/Defense 1v1 Practice. The public
`startSession` action accepts only the two implemented sessions. Solo and 1v1
cards are disabled and marked “Coming later”.

The existing `Duel` simulation, Rapier world, `Character` animation component,
locomotion, bindings, and defensive gesture resolver are reused. Free Movement
unmounts P2 and the basketball, including their rigid bodies and colliders.
The existing ball state union gains `inactive`; there is no second ball machine.
P1 always reads defense bindings. No CPU updates, inbound clock, ball pickups,
body contacts, auto-facing toward a missing opponent, or physical pushes run in
this drill. Arm contact receives an explicit absent opponent and uses its existing
non-contact pose. Arm IK, walking animation, physics tuning, GLBs, and right-stick
directional mapping are unchanged.

Starting/restarting a session clears held input, gesture sequences, pending skills,
contact actions, velocities, inbound requests/flights/timers, score, and effects.
The existing revision mechanism synchronizes initialization before input sampling
and simulation. Arena effects initialize after Rapier mounts/unmounts its bodies,
including when the game is paused. Function body refs are explicitly cleared on
unmount because Rapier 2.2 does not invoke function refs with `null` on removal.
P1/P2 selections, sound, and saved bindings are retained.

Pause/resume preserves the session and position. `RESTART TRAINING` restarts Free
Movement; `NEW DUEL` explicitly starts Duel. Character changes remain in the pause
menu and reinitialize the selected session.

## Changed files

- `src/game/state/gameStore.ts`: session contract, supported-session entry, restart,
  initial HUD, and roster/input reset.
- `src/game/entities/Duel.ts`, `DuelArena.tsx`: shared simulation gating, reset,
  entity lifecycle, body-ref cleanup, and active rings/countdown.
- `src/game/simulation/{types,runtime,hudSnapshot}.ts`: inactive basketball state,
  movement initialization, and CPU-free HUD projection.
- `src/game/entities/{Character,FootContactDebug,HandContactDebug}.tsx` and
  `defensiveArmContact.ts`: absent opponent/ball guards, with no IK solver changes.
- `src/game/input/{controlContext,defensiveHands,dribbleSkillBuffer}.ts` and
  `src/components/touch-overlay/TouchOverlay.tsx`: defense context and gesture reset.
- `src/components/game-ui/{PauseMenu,HUD}.tsx`, `src/index.css`: Training selection,
  disabled future modes, restart, and practice HUD using existing styling.
- `src/game/harness/useDuelTestSeam.ts`, `RightStickDebugOverlay.tsx`: active entity
  diagnostics and P1-only RS Debug in Free Movement.
- `tests/stores.test.ts`, `tests/browser/training.spec.ts`: session and real-scene
  acceptance coverage.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- `npm test`: 178 passed.
- `npm run build`: passed (existing Vite chunk-size advisory).
- Existing browser suites `gameplay`, `input`, `inbound`, `defensive-hands`: 19 passed.
- Production preview: Training acceptance flow passed at `http://127.0.0.1:4173/`,
  with normal production rules and without the development RS overlay.

`tests/browser/training.spec.ts`: all 3 passed (both characters, eight headings,
keyboard/gamepad/touch, pause/resume/restart/New Duel). One initial browser run
found Rapier's stale body references; explicit unmount cleanup fixed that failure.
A double-flick test initially read before fixed physics consumed the pending command;
its assertion now waits for that physics step.

Training browser scenarios deliberately leave global `testMode` disabled. They
exercise keyboard, a simulated standard gamepad, and CDP touch events through the
existing input pipeline. Eight headings are reached by actual left-stick movement,
without teleporting or forcing facing. Directions are checked against existing RS
Debug and real skeleton joint data. Front/rear double flicks check wave/push, with
no target or contact impulse. Restart while RS is held checks neutral rearming.

## Limits and acceptance

Only Free Movement is implemented. Solo Practice, 1v1 Practice and the expanded
INPUT/BODY/BALL diagnostic layout belong to later slices. Existing RS Debug and
hand/foot diagnostics remain available in development. Production Training needs
no development flag. Automated gamepad input is simulated; physical controller and
mobile-device feel still require hands-on acceptance.

Local visual evidence (git-ignored, matching the repository's existing review workflow):

- [Production screenshot gallery](../playtest/train-1/index.html)
- [Training menu](../playtest/train-1/training-menu.png)
- [Shaq alone](../playtest/train-1/free-movement-shaq.png)
- [Chuck alone](../playtest/train-1/free-movement-chuck.png)
- [New Duel restores opponent and ball](../playtest/train-1/new-duel.png)
- [Shaq defensive left](../playtest/train-1/shaq-defensive-left.png)
- [Chuck defensive left](../playtest/train-1/chuck-defensive-left.png)

Do not merge or begin the next training slice until the real-scene screenshots and
playable Free Movement receive visual acceptance.
