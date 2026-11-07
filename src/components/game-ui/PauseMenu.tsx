import { useState } from 'react';
import { PORTRAIT_PATHS } from '../../game/assets/manifest';
import { config, type Legend } from '../../game/data/gameConfig';
import { useGameStore } from '../../game/state/gameStore';
import { HelpScreen } from './HelpScreen';
import { JabaliBranding } from './JabaliBranding';

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
  const [help, setHelp] = useState(false);
  if (help) return <HelpScreen onBack={() => setHelp(false)} />;
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
        <button type="button" onClick={() => useGameStore.getState().reset()}>
          NEW DUEL
        </button>
        <button type="button" onClick={() => setHelp(true)}>
          HOW TO BRAWL
        </button>
        <SoundToggle />
      </div>
      <div className="brand-footer">
        <JabaliBranding />
      </div>
    </div>
  );
}
