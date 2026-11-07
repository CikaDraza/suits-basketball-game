import { useState } from 'react';
import { styles } from './styles';
import type { TouchOverlayConfig } from './types';
import { useActionButton } from './useActionButton';
import { useJoystickInput } from './useJoystickInput';

function isMobileDevice() {
  return /mobile|android|iphone|ipod|blackberry|opera mini|iemobile|ipad|tablet/i.test(
    navigator.userAgent,
  );
}

const safeBottom = 'max(4cqh, 34px, env(safe-area-inset-bottom, 0px))';

export function TouchOverlay({
  showJoystick = true,
  showButtonA = true,
  showButtonB = true,
  buttonALabel = 'A',
  buttonBLabel = 'B',
  deadzone = 0.08,
  threshold = 0.35,
  analogOnly = false,
  forceShow = false,
}: TouchOverlayConfig = {}) {
  const [isMobile] = useState(isMobileDevice);
  const shouldShow = forceShow || isMobile;
  const { baseRef, knobRef, ...joystickEvents } = useJoystickInput({
    enabled: shouldShow && showJoystick,
    deadzone,
    threshold,
    analogOnly,
  });
  const actionA = useActionButton('ACTION_A');
  const actionB = useActionButton('ACTION_B');
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
          <button
            type="button"
            style={{ ...styles.btn, ...styles.top }}
            aria-label="Triangle: post / spin"
            disabled={!showButtonB}
            {...actionB}
          >
            {buttonBLabel}
          </button>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.left }}
            aria-label="Square: shoot / contest"
            disabled={!showButtonA}
            {...actionA}
          >
            {buttonALabel}
          </button>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.right, ...styles.disabled }}
            aria-label="Circle"
            disabled
          >
            ○
          </button>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.bottom, ...styles.disabled }}
            aria-label="Cross"
            disabled
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default TouchOverlay;
