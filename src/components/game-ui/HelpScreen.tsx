import { config } from '../../game/data/gameConfig';

const helpSections = [
  {
    title: '01 / OWN THE PAINT',
    description:
      'Joystick, WASD or arrows to move. Tap △ / Q to post up. Push toward the hoop to back down. Left/right + Q while posting spins toward the rim.',
  },
  {
    title: '02 / CASH THE SHOT',
    description:
      'Hold □ / R / Space to raise the ball. Release when the marker is GREEN at forehead level. Close to the rim? It becomes a heavy dunk. Triple quick taps smash the ball into your rival.',
  },
  {
    title: '03 / DIRTY DEFENSE',
    description:
      'Hold □ / R to stand tall and contest. Double-tap △ / Q to flop. Your body becomes a trip trap. Mash Q, R or flick the stick to get up faster.',
  },
  {
    title: '04 / KNOW WHEN TO REST',
    description:
      'Moving and pushing drain energy. Stop to catch your breath. An empty tank means slow feet, fumbles and humiliating scrambles. Move near a loose ball to recover it.',
  },
  {
    title: `05 / NO FOULS. FIRST TO ${config.score.winTarget}.`,
    description:
      'One point in close, two beyond the arc. The scorer keeps possession. Every start and restart uses the left sideline. Out of bounds awards the opponent of the last player to touch the ball. Q seals during positioning and passes immediately in the pass window.',
  },
  {
    title: '06 / LOCAL DUEL',
    description:
      'Default controls: left stick moves. Aim the right stick toward the visible hand you want, then return to neutral before another crossover. Z/C select anatomical left/right on keyboard. Triangle posts, Square shoots. Change and save bindings in timeout → Controls. A second active controller takes over CPU.',
  },
];

export function HelpScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="full-panel help-panel">
      <span className="eyebrow">THE EMPLOYEE HANDBOOK</span>
      <h2>
        HOW TO
        <br />
        BRAWL<span>.</span>
      </h2>
      <div className="help-list">
        {helpSections.map((section) => (
          <section key={section.title}>
            <b>{section.title}</b>
            <p>{section.description}</p>
          </section>
        ))}
      </div>
      <button type="button" className="game-btn game-btn--primary" onClick={onBack}>
        GOT IT ↗
      </button>
    </div>
  );
}
