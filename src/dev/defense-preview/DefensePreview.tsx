import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { DefenseScene, type DefenseReport } from './DefenseScene';
import '../animation-preview/preview.css';
import { ANIMATION_PATHS } from '../../game/assets/manifest';

class PreviewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <p role="alert">Defense preview failed: {this.state.error}</p>
    ) : (
      this.props.children
    );
  }
}

function PlaybackTime({ jump }: { jump: boolean }) {
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = (jump ? window.__JUMP_PREVIEW__ : window.__DEFENSE_PREVIEW__)?.getState();
      if (state && output.current)
        output.current.textContent = `${state.time.toFixed(2)} / ${state.duration.toFixed(2)} s`;
    }, 100);
    return () => window.clearInterval(timer);
  }, [jump]);
  return <output ref={output} aria-label="Playback time" />;
}

export default function DefensePreview({ jump = false }: { jump?: boolean }) {
  const [report, setReport] = useState<DefenseReport | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [restart, setRestart] = useState(0);
  return (
    <main className="animation-preview">
      <section
        className="preview-stage"
        aria-label={jump ? 'Shaq small jump animation scene' : 'Shaq defense animation scene'}
      >
        <PreviewBoundary>
          <Canvas dpr={1} camera={{ position: [0, 1.65, 5.5], fov: 40 }}>
            <Suspense fallback={null}>
              <DefenseScene
                playing={playing}
                speed={speed}
                restart={restart}
                onReport={setReport}
                {...(jump
                  ? {
                      assetPath: ANIMATION_PATHS.shaq.smallJump,
                      clipName: 'SHAQ_SMALL_BLOCK_JUMP_V01',
                      apiKey: '__JUMP_PREVIEW__' as const,
                    }
                  : {})}
              />
            </Suspense>
          </Canvas>
        </PreviewBoundary>
        <p className="orbit-hint">Drag to orbit · wheel to zoom · right-drag to pan.</p>
      </section>
      <aside className="preview-panel">
        <p className="eyebrow">SUITS / DEVELOPMENT ONLY</p>
        <h1>{jump ? 'Shaq small jump preview' : 'Shaq defense preview'}</h1>
        <p>
          {jump
            ? 'First short block attempt, cropped from the supplied Shaq-retargeted export.'
            : 'Full defense sequence on the active Shaq model.'}
        </p>
        <p>
          {jump
            ? 'Preparation → Takeoff → Right-arm reach → Landing → Recovery'
            : 'Defense Enter → Defense Wide → Defense High'}
        </p>
        <p>Plays once and holds the final pose. Restart to replay the full sequence.</p>
        <fieldset disabled={!report}>
          <legend>Playback</legend>
          <div className="playback-buttons">
            <button onClick={() => setPlaying(true)}>Play</button>
            <button onClick={() => setPlaying(false)}>Pause</button>
            <button
              onClick={() => {
                setRestart((value) => value + 1);
                setPlaying(true);
              }}
            >
              Restart
            </button>
          </div>
          <label>
            Animation speed · {speed.toFixed(2)}×
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.05"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
          </label>
          <PlaybackTime jump={jump} />
        </fieldset>
        {report ? (
          <>
            <h2>Rig compatibility verified</h2>
            <p>
              {report.bones} bones · {report.tracks} animation tracks
            </p>
            <p>Only the active model is displayed. The animation source mesh is never mounted.</p>
            <details>
              <summary>Compatibility report</summary>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </>
        ) : (
          <p role="status">Loading animation and checking bone compatibility…</p>
        )}
        <p>Isolated preview: gameplay, walking, ball controls and IK are inactive.</p>
      </aside>
    </main>
  );
}
