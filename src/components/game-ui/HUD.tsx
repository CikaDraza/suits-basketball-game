import { PORTRAIT_PATHS } from '../../game/assets/manifest';
import { config } from '../../game/data/gameConfig';
import { isFreeMovement, useGameStore } from '../../game/state/gameStore';
import type { PlayerSlot } from '../../game/simulation/types';
import {
  isPerfectCharge,
  selectActionHint,
  selectHandlingLabel,
  shotTargetStyle,
} from './hudModel';
import { useInboundPass } from './useInboundPass';

function EnergyMeter({ slot }: { slot: PlayerSlot }) {
  const energy = useGameStore((state) => state.energies[slot]);
  const low = slot === 0 && energy < config.player.exhaustedThreshold;
  const percent = (energy / config.player.energyMax) * 100;
  return (
    <div className={`energy${slot === 1 ? ' blue' : ''}${low ? ' low' : ''}`}>
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

function PlayerScore({ slot }: { slot: PlayerSlot }) {
  const score = useGameStore((state) => (slot === 0 ? state.score : state.cpuScore));
  return <strong>{score.toString().padStart(2, '0')}</strong>;
}

function FighterChip({ slot }: { slot: PlayerSlot }) {
  const legend = useGameStore((state) => state.legends[slot]);
  const cpu = useGameStore((state) => slot === 1 && state.cpu);
  const movement = useGameStore((s) => isFreeMovement(s.session));
  const portrait = <img src={PORTRAIT_PATHS[legend]} alt="" />;
  return (
    <div className={`fighter-chip${slot === 1 ? ' rival' : ''}`}>
      {slot === 0 && portrait}
      <div>
        <span className="micro">
          {slot === 0 ? 'YOU' : cpu ? 'CPU' : 'P2'} · {config.player[legend].name}
        </span>
        {!movement && <PlayerScore slot={slot} />}
        <EnergyMeter slot={slot} />
      </div>
      {slot === 1 && portrait}
    </div>
  );
}

function TrashTalk() {
  const message = useGameStore((state) => state.message);
  return message ? (
    <div key={message} className="trash-talk">
      {message}
    </div>
  ) : null;
}

function HandlingLabel() {
  const label = useGameStore(selectHandlingLabel);
  return <span className="micro">{label}</span>;
}

function ShotFeedback() {
  const charge = useGameStore((state) => state.charge);
  const action = useGameStore(selectActionHint);
  const perfect = isPerfectCharge(charge);
  return (
    <>
      <div className={`shot-meter${perfect ? ' perfect' : ''}`}>
        <div className="target" style={shotTargetStyle} />
        <i style={{ left: `${Math.min(98, (charge / config.shots.raiseDuration) * 100)}%` }} />
      </div>
      <p>{perfect ? 'RELEASE!' : action}</p>
    </>
  );
}

function InboundPassButton() {
  const handlers = useInboundPass();
  return (
    <button type="button" className="inbound-prompt" aria-label="Pass inbound" {...handlers}>
      ✕<span>E / ✕ / A</span>
    </button>
  );
}

function InboundPrompt() {
  const visible = useGameStore(
    (state) => state.inbound?.stage === 'PASS_WINDOW' && state.inbound.owner === 0,
  );
  return visible ? <InboundPassButton /> : null;
}

const pauseGame = () => useGameStore.getState().pause();

/** Each changing HUD field owns its subscription; the layout has no store subscription. */
export function HUD() {
  const movement = useGameStore((s) => isFreeMovement(s.session));
  return (
    <div className="hud">
      <header className="hud-header">
        <FighterChip slot={0} />
        <div className="match-chip">
          <span className="micro">{movement ? 'TRAINING' : 'NO FOULS'}</span>
          <b>{movement ? 'FREE MOVEMENT' : `FIRST TO ${config.score.winTarget}`}</b>
          <span className="live-dot">● LIVE</span>
        </div>
        {!movement && <FighterChip slot={1} />}
      </header>
      <div className="court-heading">
        <span>THE LAST DANCE</span>
        <h1>
          SUITS<span>.</span>
        </h1>
        <p>ALL BUSINESS. NO FOULS.</p>
        <TrashTalk />
      </div>
      <button type="button" className="pause-btn" onClick={pauseGame} aria-label="Pause">
        Ⅱ
      </button>
      <div className="bottom-info">
        <HandlingLabel />
        {movement ? <p>MOVE · STANCE · DEFENSIVE HANDS</p> : <ShotFeedback />}
      </div>
      <InboundPrompt />
      <div className="control-legend">
        <span>MOVE</span>
        <span>{movement ? '△ STANCE' : '△ POST / SPIN'}</span>
        <span>{movement ? '□ CONTEST · RS HANDS' : '□ SHOOT / CONTEST'}</span>
      </div>
    </div>
  );
}
