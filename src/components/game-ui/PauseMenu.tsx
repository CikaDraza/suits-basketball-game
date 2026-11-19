import { useState } from 'react';
import { PORTRAIT_PATHS } from '../../game/assets/manifest';
import { config, type Legend } from '../../game/data/gameConfig';
import { useGameStore, type GameSession } from '../../game/state/gameStore';
import { HelpScreen } from './HelpScreen';
import { DmdBranding } from './DmdBranding';
import { ControlsSettings } from './ControlsSettings';

const legends: readonly Legend[] = ['shaq', 'chuck'];

function RosterSlot({ slot }: { slot: 0 | 1 }) {
  const selected = useGameStore((state) => state.legends[slot]);
  return (
    <section>
      <span className="micro">{slot === 0 ? 'PLAYER 1' : 'PLAYER 2 · CPU IF IDLE'}</span>
      <div className="roster">
        {legends.map((legend) => (
          <button
            type="button"
            className={`roster-card${selected === legend ? ' selected' : ''}`}
            aria-pressed={selected === legend}
            onClick={() => useGameStore.getState().choose(slot, legend)}
            key={legend}
          >
            <img src={PORTRAIT_PATHS[legend]} alt={config.player[legend].name} />
            <strong>{config.player[legend].name}</strong>
          </button>
        ))}
      </div>
      <p>
        {config.player[selected].mass} KG ·{' '}
        {selected === 'shaq' ? 'PAINT POWER' : 'MID-RANGE MENACE'}
      </p>
    </section>
  );
}

function SoundToggle() {
  const sound = useGameStore((state) => state.sound);
  return (
    <button
      type="button"
      onClick={() => useGameStore.getState().toggleSound()}
      aria-pressed={sound}
    >
      {sound ? '♪ ON' : '♪ OFF'}
    </button>
  );
}

export function PauseMenu() {
  const [view, setView] = useState<'pause' | 'help' | 'controls' | 'training'>('pause');
  const training = useGameStore((s) => s.session.kind === 'training');
  const [drill, setDrill] = useState<'movement' | 'solo' | 'one-on-one'>('movement');
  const [role, setRole] = useState<'offense' | 'defense'>('offense');
  const practice: GameSession =
    drill === 'one-on-one' ? { kind: 'training', drill, role } : { kind: 'training', drill };
  if (view === 'help') return <HelpScreen onBack={() => setView('pause')} />;
  if (view === 'controls') return <ControlsSettings onBack={() => setView('pause')} />;
  if (view === 'training')
    return (
      <div className="full-panel training-panel">
        <span className="eyebrow">PRACTICE · AT YOUR PACE</span>
        <h2>
          TRAINING<span>.</span>
        </h2>
        <p className="panel-intro">Your player. Your court. Learn the moves.</p>
        <div className="training-modes" aria-label="Training modes">
          <button
            type="button"
            className={drill === 'movement' ? 'training-mode selected' : 'training-mode'}
            aria-pressed={drill === 'movement'}
            onClick={() => setDrill('movement')}
          >
            <span className="eyebrow">01</span>
            <span>
              <strong>FREE MOVEMENT</strong>
              <small>Movement · Defense · Footwork</small>
            </span>
          </button>
          <button
            type="button"
            className={drill === 'solo' ? 'training-mode selected' : 'training-mode'}
            aria-pressed={drill === 'solo'}
            onClick={() => setDrill('solo')}
          >
            <span className="eyebrow">02</span>
            <span>
              <strong>SOLO PRACTICE</strong>
              <small>Dribbling · Shooting · Post Moves</small>
            </span>
          </button>
          <button
            type="button"
            className={drill === 'one-on-one' ? 'training-mode selected' : 'training-mode'}
            aria-pressed={drill === 'one-on-one'}
            onClick={() => setDrill('one-on-one')}
          >
            <span className="eyebrow">03</span>
            <span>
              <strong>1v1 PRACTICE</strong>
              <small>Repeat offense or defense against CPU</small>
            </span>
          </button>
        </div>
        {drill === 'one-on-one' && (
          <div className="panel-actions" aria-label="Practice role">
            <button
              type="button"
              aria-pressed={role === 'offense'}
              onClick={() => setRole('offense')}
            >
              OFFENSE
            </button>
            <button
              type="button"
              aria-pressed={role === 'defense'}
              onClick={() => setRole('defense')}
            >
              DEFENSE
            </button>
          </div>
        )}
        <button
          type="button"
          className="game-btn game-btn--primary"
          onClick={() => useGameStore.getState().startSession(practice)}
        >
          START TRAINING ↗
        </button>
        <button type="button" className="text-button" onClick={() => setView('pause')}>
          ← BACK
        </button>
      </div>
    );
  return (
    <div className="full-panel">
      <span className="eyebrow">TIMEOUT · NO REF REQUIRED</span>
      <h2>
        BUSINESS
        <br />
        BREAK<span>.</span>
      </h2>
      <p className="panel-intro">Pick your heavyweight. Settle it on the hardwood.</p>
      <div className="matchup">
        <RosterSlot slot={0} />
        <RosterSlot slot={1} />
      </div>
      <button
        type="button"
        className="game-btn game-btn--primary"
        onClick={() => useGameStore.getState().resume()}
      >
        BACK TO BUSINESS ↗
      </button>
      <div className="panel-actions">
        <button
          type="button"
          onClick={() => useGameStore.getState().startSession({ kind: 'duel' })}
        >
          NEW DUEL
        </button>
        <button type="button" onClick={() => setView('training')}>
          TRAINING
        </button>
        {training && (
          <button type="button" onClick={() => useGameStore.getState().reset()}>
            RESTART TRAINING
          </button>
        )}
        <button type="button" onClick={() => setView('help')}>
          HOW TO BRAWL
        </button>
        <button type="button" onClick={() => setView('controls')}>
          CONTROLS / KONTROLE
        </button>
        <SoundToggle />
      </div>
      <footer className="brand-footer">
        <DmdBranding />
      </footer>
    </div>
  );
}
