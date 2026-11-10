# SUITS — RIGHT-STICK-RELATIVE-1

Base: `staging` (`a868a0e`), isolated branch `fix/right-stick-relative-1`. The uncommitted DEF-ARM-FIX-1 checkout is preserved separately. No automatic merge.

## Root cause measured before the correction

The raw JSON `camera.inputAngle` is **0**, but `gameConfig.ts` overrides it with `atan2(24.5 − 9.5, 7.48 − (−0.5))`. The actual runtime movement angle is **1.0818776375 rad / 61.9870225769°**. The rendered gameplay camera has exactly the same yaw. A movement/skill yaw mismatch is therefore not the root cause on this staging commit.

Rendered camera: position **(30.953042, 5.95, 10.913018)**, pitch **13.7585152528°**, ground-depth scale **0.2378302498**. `resolveSkillDirection()` divides stick vertical by that scale, amplifying it **4.2046796020×**. With the character facing screen-up/down, old forward/back sectors are approximately **153.3° each**, anatomical left/right approximately **26.7° each**. Facing screen-left/right reverses those sector widths. Cardinal forward inputs work, but nearby physical stick directions are classified asymmetrically.

`readDefensiveHands()` reclassifies a held vector using the current facing every frame. A physical cardinal forward hold changes `up` → `brace` after a 180° body turn without passing through neutral. Offensive gesture edges already preserve their activation facing and sequencing.

Axis processing is correctly wired: physical Axis 2 is horizontal (left negative); Axis 3 is vertical (up negative). User remapping and calibrated axis rest values are applied first. Mapped skill coordinates use positive X to screen-right and positive Z to screen-up. The radial deadzone is 0.18 by default; activation/release use mapped magnitudes 0.65/0.25. No Axis 2/3 swap or sign change is required.

Raw browser measurements are saved in `playtest/right-stick-relative-1/before-audit.json`.

## Directional contract

The rendered camera yaw and pitch define the character's projected forward heading. For body yaw `facing` and camera yaw `yaw`, the screen-plane forward direction is normalized `(sin(facing − yaw), −sin(pitch) × cos(facing − yaw))` in right/up coordinates. The normalized physical stick is compared with that heading and its perpendicular anatomical-left direction, producing four equal 90° sectors. Pitch projects the body heading; it does not stretch the input vector. Sector boundaries deterministically prefer lateral actions.

Left-stick locomotion keeps its existing configured reference and processing. Only right-stick gesture classification and defense gesture lifetime change. Active defense remains locked until neutral; lifecycle changes invalidate the hold and require a fresh neutral sample. Double flicks remain distinct accepted gestures separated by neutral.

## Implementation boundaries

The functional correction is shared by offense and defense in `skillGesture.ts`. The defensive input latch owns a single accepted action and activation facing until radial neutral. The offensive buffer keeps its existing queue, rejection, sequencing and double-rear upgrade behavior; added fields only distinguish accepted input from the currently executing move for diagnostics. The Gamepad API calibration, Axis 2/3 defaults, remapping, movement processing, thresholds and double-flick windows remain unchanged.

The DEV-only `RS debug` panel is a DOM observer sampled at 10 Hz. It shows raw physical Axis 2/3, the learned axis map, calibrated/pre-deadzone vector, radial-deadzone output, normalized direction, actual camera yaw/pitch, movement reference, body-facing/locked-facing, body-relative components, current candidate, selected command, executing skill and last accepted command. Green means projected body-forward; orange is the physical screen-intent stick vector. The panel never drives gameplay and is absent from production DOM, including when the query parameter is present.

Original animation, arm IK, ball handling/physics, camera placement, GLBs and left-stick semantics have no changes in this checkout. The previous uncommitted DEF-ARM-FIX-1 work remains in the original checkout.

## Automated verification

`npm run check` passes: TypeScript, lint, **165 unit/regression tests** and formatting. The production build passes with the existing bundle-size warning. The final actual-camera matrix/hold suite passes **4/4**, including **512/512** correctly selected directions. Remapping/P2/learning/crossover-drive suite passes **7/7**. The existing combo/defense regression suite passes **5/5**. Total: **16 passed browser scenarios**, plus the interactive/production smoke.

| Measurement                                   | Before                | After                       |
| --------------------------------------------- | --------------------- | --------------------------- |
| Runtime movement yaw / rendered camera yaw    | 61.987° / 61.987°     | unchanged                   |
| Camera pitch / pitch scale                    | 13.7585° / 0.23783025 | unchanged                   |
| Stick-vertical amplification                  | 4.20468×              | 1×                          |
| Up/down-facing body's forward/back sectors    | ≈153.3° each          | 90° each                    |
| Up/down-facing body's left/right sectors      | ≈26.7° each           | 90° each                    |
| Left/right-facing body's forward/back sectors | ≈26.7° each           | 90° each                    |
| Left/right-facing body's left/right sectors   | ≈153.3° each          | 90° each                    |
| Held `up`, body turns 180°                    | changes to `brace`    | stays `up`, both characters |

A discrete 0.1° browser sweep reports 89.9–90.1° after the correction because exact boundary bins prefer lateral actions. Offset dense unit samples give four equal 90° sectors. The rendered character-facing transform agrees with `(sin(p.angle), cos(p.angle))` to a maximum component difference of 6.2×10⁻¹⁶ in the 512-case matrix; no extra rig-facing offset was found.

The original Axis 2/3 signs, calibration and radial deadzone remain intact. With the default 0.18 deadzone, mapped activation/release magnitudes 0.65/0.25 correspond to raw radial magnitudes 0.713/0.385 for centered axes. These thresholds were not retuned.

- Unit and repository checks: `npm run check` (165 tests), `npm run build`.
- Actual-camera matrix: both characters × both contexts × eight visible body headings × sixteen physical stick headings = **512 samples**. Includes the four cardinal axes, four diagonals and eight intermediate angles. Expectations come independently from the rendered camera's ground projection; the actual rendered character-forward transform is compared with `p.angle`.
- Held input: body rotation, stick sweep, camera inspection rotation, neutral rearm and reconnect.
- Existing offense/defense regressions: side/front/rear combinations, both initial hands, double rear, wave and shove. Calibrated/remapped controller checks run through the Gamepad API.
- Separate interactive page exercises the full controller pipeline with virtual physical axes; it does not inject basketball commands. Production smoke verifies that the correction works without displaying the DEV overlay.

There is no separately named or separately bound **between-the-legs** technique on this staging commit: the existing skill kinds are `side`, `front` and `behind`. Existing front/crossover flows are preserved and tested; this slice does not introduce a new technique.

## Evidence and reproduction

Local machine-readable evidence lives in `playtest/right-stick-relative-1/`: `before-audit.json`, `after-audit.json`, `matrix-summary.json`, per-character `*-direction-matrix.json`, `*-hold-proof.json`, `interactive-proof.json`, and `protected-boundaries.json`. Logs are saved beside those artifacts. Generated measurements/screenshots stay git-ignored; the interactive verifier itself is versioned at [tests/manual/right-stick-relative.html](../tests/manual/right-stick-relative.html).

Visual evidence: [physical-forward input](../playtest/right-stick-relative-1/interactive-forward-proof.png), [body turn while held](../playtest/right-stick-relative-1/interactive-held-turn.png), [new action after neutral](../playtest/right-stick-relative-1/interactive-verification.png), [Shaq debug overlay](../playtest/right-stick-relative-1/shaq-debug-overlay.png), [Chuck debug overlay](../playtest/right-stick-relative-1/chuck-debug-overlay.png).

Run the DEV server on 5181, then:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5181/game/ \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/google/chrome/chrome \
npx playwright test tests/browser/right-stick-relative.spec.ts
```

The browser matrix sets fixture facing/possession and supplies raw `navigator.getGamepads()` values; it does not invoke resolved basketball actions. Expected directions are computed from independently projected world vectors. Original regression helpers now use the perpendicular of visible body-forward for lateral intent, replacing their old inverse-projected anatomical-side assumption. Initial matrix failures exposed fixture auto-facing in hold mode and short moves completing before observation; the final fixture uses dribble mode for free facing and distinguishes selected intent from executing skill.

## Short manual gamepad acceptance

1. Run this checkout with `npm run dev -- --host 127.0.0.1 --port 5181 --strictPort`. Open `/game/?rightStickDebug=1` with the physical controller connected and centered. Keep the existing learned bindings; use `RS debug` to toggle the panel. Test both Shaq and Chuck via Pause → roster.
2. In defense, face screen-left and hold physical left: expect `up`. Repeat screen-right/right, screen-up/up and screen-down/down. The orange and green arrows should align.
3. Choose the opposite direction after returning to neutral: expect `brace`. Choose the two perpendicular directions: expect the corresponding anatomical `left`/`right` arm. Also test the diagonal and intermediate directions around each boundary.
4. While holding one accepted direction, turn with the left stick and sweep the right stick without crossing neutral. The selected defensive action and locked facing must stay unchanged. Release through center, then deflect again: a fresh action must be selected from the new orientation.
5. Two distinct forward flicks separated by center should produce `wave`; two rear flicks should produce one shove when an opponent is in range. Holding the second flick must not repeat it. Pause/reconnect while held must require neutral before accepting input again.
6. In offense, verify same-hand double, opposite-hand crossover, front combination, single rear and double rear from both initial hands. A held direction must not repeat or change technique during a turn. Finally verify that ordinary left-stick movement and your saved custom Axis map still behave as before.

For repeatable browser exploration without hardware, open `/game/tests/manual/right-stick-relative.html` on the DEV server. Its virtual pad is limited to that test iframe. Choose character/context/body heading, press physical arrows, rotate while held, return to neutral and try a double flick. The separate main-game link uses the real controller.

Automated runs use controlled Gamepad API axes; final acceptance on the user's physical controller is intentionally left to the user. No merge has been performed.
