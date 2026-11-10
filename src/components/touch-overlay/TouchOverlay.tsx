import { useState } from 'react';
import { styles } from './styles';
import type { TouchOverlayConfig } from './types';
import { useActionButton } from './useActionButton';
import { useJoystickInput } from './useJoystickInput';
import { isFreeMovement, useGameStore } from '../../game/state/gameStore';
import { useControlSettingsStore } from '../../game/state/controlSettingsStore';
import {
  TOUCH_SLOTS,
  TOUCH_GLYPHS,
  ACTION_LABELS,
  type ControlAction,
  type TouchSlot,
  type ControlContext,
} from '../../game/input/controlBindings';
function isMobileDevice() {
  return /mobile|android|iphone|ipod|blackberry|opera mini|iemobile|ipad|tablet/i.test(
    navigator.userAgent,
  );
}
const safeBottom = 'max(4cqh, 34px, env(safe-area-inset-bottom, 0px))';
const slotNames: Record<TouchSlot, string> = {
  square: 'Square',
  triangle: 'Triangle',
  circle: 'Circle',
  cross: 'Cross',
};
const positions = {
  square: styles.left,
  triangle: styles.top,
  circle: styles.right,
  cross: styles.bottom,
};
function MappedButton({
  slot,
  action,
  context,
  enabled,
}: {
  readonly slot: TouchSlot;
  readonly action: ControlAction | null;
  readonly context: ControlContext;
  readonly enabled: boolean;
}) {
  const events = useActionButton(action ?? 'ACTION_A');
  const description =
    action === 'ACTION_A'
      ? 'shoot / contest'
      : action === 'ACTION_B'
        ? 'post / spin'
        : action
          ? ACTION_LABELS[context][action]
          : 'not assigned';
  return (
    <button
      type="button"
      style={{ ...styles.btn, ...positions[slot], ...(!action || !enabled ? styles.disabled : {}) }}
      aria-label={`${slotNames[slot]}: ${description}`}
      disabled={!action || !enabled}
      {...events}
    >
      {TOUCH_GLYPHS[slot]}
    </button>
  );
}
export function TouchOverlay({
  showJoystick = true,
  showButtonA = true,
  showButtonB = true,
  deadzone = 0.08,
  threshold = 0.35,
  analogOnly = false,
  forceShow = false,
}: TouchOverlayConfig = {}) {
  const [isMobile] = useState(isMobileDevice);
  const shouldShow = forceShow || isMobile;
  const context = useGameStore((s) =>
    !isFreeMovement(s.session) && (s.inbound?.owner ?? s.owner) === 0 ? 'offense' : 'defense',
  );
  const bindings = useControlSettingsStore((s) => s.profile[context].mobile);
  const { baseRef, knobRef, ...joystickEvents } = useJoystickInput({
    enabled: shouldShow && showJoystick,
    deadzone,
    threshold,
    analogOnly,
  });
  if (!shouldShow) return null;
  return (
    <div style={styles.overlay}>
      {showJoystick && (
        <div
          ref={baseRef}
          style={{ ...styles.joyBase, left: '4cqw', bottom: safeBottom }}
          {...joystickEvents}
          aria-label="Movement joystick"
        >
          <div ref={knobRef} style={styles.joyKnob} />
        </div>
      )}
      {(showButtonA || showButtonB) && (
        <div style={{ ...styles.faceCluster, bottom: safeBottom }}>
          {TOUCH_SLOTS.map((slot) => (
            <MappedButton
              key={slot}
              slot={slot}
              action={bindings[slot]}
              context={context}
              enabled={
                bindings[slot] === 'ACTION_A'
                  ? showButtonA
                  : bindings[slot] === 'ACTION_B'
                    ? showButtonB
                    : true
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
export default TouchOverlay;
