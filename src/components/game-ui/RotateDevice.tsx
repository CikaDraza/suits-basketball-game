import { useEffect } from 'react';
import { useGameStore } from '../../game/state/gameStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const portraitQuery = '(orientation: portrait)';

/** Landscape-only game: in portrait, cover everything and pause until the phone is turned. */
export function RotateDevice() {
  const portrait = useMediaQuery(portraitQuery);
  const playing = useGameStore((state) => state.screen === 'playing');
  useEffect(() => {
    if (portrait && playing) useGameStore.getState().pause();
  }, [portrait, playing]);
  if (!portrait) return null;
  return (
    <div className="rotate-device" role="alert">
      <div className="rotate-phone" aria-hidden="true">
        <i />
      </div>
      <span className="eyebrow">THE LAST DANCE</span>
      <h2>
        TURN IT
        <br />
        SIDEWAYS<span>.</span>
      </h2>
      <p className="panel-intro">
        SUITS is played in landscape. Rotate your phone to get back to business.
      </p>
    </div>
  );
}
