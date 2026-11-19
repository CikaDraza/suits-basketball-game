import { config } from '../../game/data/gameConfig';

const helpSections = [
  {
    title: '01 / OWN THE PAINT',
    description:
      'Joystick, WASD or arrows to move. Q / L1-LB enters or leaves stance; touch uses △. F / Triangle-Y makes a small jump; touch uses ↑. Push toward the hoop to back down. Left/right + Q while posting spins toward the rim.',
  },
  {
    title: '02 / CASH THE SHOT',
    description:
      'Hold □ / R / Space to raise the ball. Release when the marker is GREEN at forehead level. Close to the rim? It becomes a heavy dunk. Triple quick taps smash the ball into your rival.',
  },
  {
    title: '03 / DIRTY DEFENSE',
    description:
      'Hold □ / R to contest. The right stick controls defensive arms. Forward raises both arms. Two quick forward flicks push when contact is within reach. Hold back to brace with one forearm. Return to neutral between flicks. Q exits stance and restores natural movement. Hold ○ / B or V to set for a charge. Double-tap the same control to flop backward. Mash Q, R or flick the stick to get up faster.',
  },
  {
    title: '04 / KNOW WHEN TO REST',
    description:
      'Moving and pushing drain energy. Stop to catch your breath. An empty tank means slow feet, fumbles and humiliating scrambles. Move near a loose ball to recover it.',
  },
  {
    title: `05 / NO FOULS. FIRST TO ${config.score.winTarget}.`,
    description:
      'One point in close, two beyond the arc. The scorer keeps possession. Every start and restart uses the left sideline. Out of bounds awards the opponent of the last player to touch the ball. Q / L1-LB seals; Cross / A / E passes in the inbound window.',
  },
  {
    title: '06 / LOCAL DUEL',
    description:
      'Left stick moves. The right stick follows the body through the camera: ball side gives two quick bounces, opposite side crosses over, forward chains three quick crossovers, back crosses behind the back. Two quick back flicks chain three behind-back transfers. Return to neutral between flicks. Z/C select hands on keyboard. Change bindings in timeout → Controls. A second active controller takes over CPU.',
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
