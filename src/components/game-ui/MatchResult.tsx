import { PORTRAIT_PATHS } from '../../game/assets/manifest';
import { useGameStore } from '../../game/state/gameStore';

const resultCopy = {
  win: {
    slot: 0,
    eyebrow: 'THE BOARD HAS SPOKEN',
    title: ['HOSTILE', 'TAKEOVER'],
    intro: 'You own the paint. And the parking space.',
    portraitAlt: 'Winner',
  },
  loss: {
    slot: 1,
    eyebrow: 'ROUGH DAY AT THE OFFICE',
    title: ['YOU GOT', 'DOWNSIZED'],
    intro: 'Catch your breath. Your suit can take another round.',
    portraitAlt: 'Opponent',
  },
} as const;

export interface MatchResultProps {
  score: number;
  outcome: keyof typeof resultCopy;
}

export function MatchResult({ score, outcome }: MatchResultProps) {
  const copy = resultCopy[outcome];
  const legend = useGameStore((state) => state.legends[copy.slot]);
  const cpuScore = useGameStore((state) => state.cpuScore);
  return (
    <div className={`full-panel end-panel${outcome === 'loss' ? ' loss' : ''}`}>
      <span className="eyebrow">{copy.eyebrow}</span>
      <img className="winner-portrait" src={PORTRAIT_PATHS[legend]} alt={copy.portraitAlt} />
      <h2>
        {copy.title[0]}
        <br />
        {copy.title[1]}
        <span>.</span>
      </h2>
      <div className="final-score">
        {score} <span>—</span> {cpuScore}
      </div>
      <p className="panel-intro">{copy.intro}</p>
      <button
        type="button"
        className="game-btn game-btn--primary"
        onClick={() => useGameStore.getState().reset()}
      >
        RUN IT BACK ↗
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => useGameStore.getState().setScreen('paused')}
      >
        CHANGE THE MATCHUP
      </button>
    </div>
  );
}
