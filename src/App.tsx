import { GameCanvas } from './game/GameCanvas';
import { useGameControls, unlockGame } from './game/input/useGameControls';
import { useGameStore } from './game/state/gameStore';
import { HUD, PauseMenu, GameOver, WinScreen } from './components/game-ui';
import { TouchOverlay } from './components/touch-overlay';
import { RotateDevice } from './components/game-ui/RotateDevice';
import { RightStickDebugOverlay } from './game/harness/RightStickDebugOverlay';

function MatchResult({ won }: { readonly won: boolean }) {
  const finalScore = useGameStore((state) => state.finalScore);
  return won ? <WinScreen score={finalScore} /> : <GameOver score={finalScore} />;
}

function GameOverlay() {
  const screen = useGameStore((state) => state.screen);

  switch (screen) {
    case 'playing':
      return (
        <>
          <HUD />
          <TouchOverlay forceShow analogOnly buttonALabel="□" buttonBLabel="△" />
        </>
      );
    case 'paused':
      return <PauseMenu />;
    case 'win':
      return <MatchResult won />;
    case 'gameover':
      return <MatchResult won={false} />;
  }
}

export default function App() {
  useGameControls();

  return (
    <div className="app-container" onPointerDown={unlockGame}>
      <div className="game-viewport">
        <GameCanvas />
        <GameOverlay />
        <RotateDevice />
        {import.meta.env.DEV && <RightStickDebugOverlay />}
      </div>
    </div>
  );
}
