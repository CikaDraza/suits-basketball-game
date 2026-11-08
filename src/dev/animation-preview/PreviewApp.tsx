import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PreviewScene, type PlaybackSettings } from './PreviewScene';
import type { ComparisonReport } from './assetInspection';
import './preview.css';

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <p role="alert">GLB load failed: {this.state.error}</p>
    ) : (
      this.props.children
    );
  }
}

function PlaybackClock() {
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = window.__ANIMATION_PREVIEW__?.getState();
      if (state && output.current)
        output.current.textContent = `${state.time.toFixed(2)} / ${state.duration.toFixed(3)} s · loops ${state.loops}`;
    }, 125);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <output ref={output} aria-label="Playback time">
      Loading…
    </output>
  );
}

export default function PreviewApp() {
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [settings, setSettings] = useState<PlaybackSettings>({
    clip: '',
    playing: true,
    speed: 1,
    restart: 0,
    showAuxiliary: false,
    showOriginal: true,
    showSkeleton: false,
  });
  const auxiliary = report?.animated.meshes.filter((mesh) => !mesh.character) ?? [];
  const rigs = report?.comparison;
  const compatible = rigs && !rigs.missing.length && !rigs.added.length && !rigs.reparented.length;
  const selected = settings.clip || report?.defaultClip || '';
  return (
    <main className="animation-preview">
      <section className="preview-stage" aria-label="Separate animation scene">
        <div className="preview-labels">
          <span>Original Shaq · rest pose</span>
          <span>Walking test · exported motion</span>
        </div>
        <PreviewErrorBoundary>
          <Canvas dpr={1} camera={{ position: [0, 1.65, 6.5], fov: 40 }}>
            <Suspense fallback={null}>
              <PreviewScene settings={settings} onReport={setReport} />
            </Suspense>
          </Canvas>
        </PreviewErrorBoundary>
        <p className="orbit-hint">
          Drag to orbit · wheel to zoom · right-drag to pan. Exported root motion is retained.
        </p>
      </section>
      <aside className="preview-panel">
        <p className="eyebrow">SUITS / DEVELOPMENT ONLY</p>
        <h1>Animated GLB inspection</h1>
        <p>Independent scene. No gameplay, physics, IK or locomotion is running.</p>
        <fieldset disabled={!report}>
          <legend>Playback</legend>
          <label>
            Animation
            <select
              value={selected}
              onChange={(e) => setSettings((s) => ({ ...s, clip: e.target.value }))}
            >
              {!report && <option>Loading GLBs…</option>}
              {report?.animated.clips.map((clip) => (
                <option key={clip.name} value={clip.name}>
                  {clip.name} ({clip.duration.toFixed(3)} s)
                </option>
              ))}
            </select>
          </label>
          <div className="playback-buttons">
            <button onClick={() => setSettings((s) => ({ ...s, playing: true }))}>Play</button>
            <button onClick={() => setSettings((s) => ({ ...s, playing: false }))}>Pause</button>
            <button onClick={() => setSettings((s) => ({ ...s, restart: s.restart + 1 }))}>
              Restart
            </button>
          </div>
          <label>
            Animation speed · {settings.speed.toFixed(2)}×
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.05"
              value={settings.speed}
              onChange={(e) => setSettings((s) => ({ ...s, speed: Number(e.target.value) }))}
            />
          </label>
          <PlaybackClock />
          {(['showOriginal', 'showSkeleton', 'showAuxiliary'] as const).map((key) => (
            <label className="toggle" key={key}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
              />
              {
                {
                  showOriginal: 'Show original for comparison',
                  showSkeleton: 'Show Shaq skeleton',
                  showAuxiliary: 'Show auxiliary FBX objects (raw export)',
                }[key]
              }
            </label>
          ))}
        </fieldset>
        {!report ? (
          <p role="status">Loading both GLBs and inspecting their rigs…</p>
        ) : (
          <>
            {auxiliary.length > 0 && (
              <p className="warning" role="status">
                Export contains {auxiliary.length} auxiliary meshes:{' '}
                {auxiliary.map((m) => m.name).join(', ')}. Hidden in the default preview, retained
                in the GLB.
              </p>
            )}
            {report.animated.clips.find((clip) => clip.name === selected)?.characterTracks ===
              0 && (
              <p className="warning">Selected clip targets the auxiliary FBX rig, not Shaq.</p>
            )}
            {report.walking && report.walking.largestHipsStep.distance > 0.15 && (
              <p className="warning">
                Root discontinuity: hips move {report.walking.largestHipsStep.distance.toFixed(3)} m
                between {report.walking.largestHipsStep.from.toFixed(3)} and{' '}
                {report.walking.largestHipsStep.to.toFixed(3)} s in the sampled clip. Playback is
                unmodified.
              </p>
            )}
            <h2>Clips</h2>
            <ul>
              {report.animated.clips.map((clip) => (
                <li key={clip.name}>
                  <strong>{clip.name}</strong>
                  <br />
                  {clip.duration.toFixed(3)} s · {clip.tracks} tracks · Shaq {clip.characterTracks}{' '}
                  / auxiliary {clip.auxiliaryTracks}
                  {clip.unresolved.length > 0 && ` · ${clip.unresolved.length} unresolved`}
                </li>
              ))}
            </ul>
            <h2>Rig comparison</h2>
            <p>
              {report.original.bones.length} → {report.animated.bones.length} Shaq bones ·{' '}
              {report.original.skeletons} → {report.animated.skeletons} total skeletons.
            </p>
            <p>
              {compatible
                ? 'Primary bone names and parent hierarchy match.'
                : 'Primary hierarchy differs — see report.'}{' '}
              Maximum rest world delta: {(report.comparison.maxRestWorldDelta * 1000).toFixed(3)}{' '}
              mm.
            </p>
            <h2>Walking root motion</h2>
            {report.walking ? (
              <p>
                Hips world range XYZ:{' '}
                {report.walking.motion.Hips.range.map((v) => v.toFixed(4)).join(' / ')} m.
                <br />
                Net displacement:{' '}
                {report.walking.motion.Hips.net.map((v) => v.toFixed(4)).join(' / ')} m. No in-place
                correction applied.
              </p>
            ) : (
              <p className="warning">No retargeted Shaq walking clip found.</p>
            )}
            {report.deformation && (
              <>
                <h2>Deformation sampling</h2>
                <p>
                  Every Shaq vertex and triangle checked at {report.deformation.samples} poses.
                  Non-finite vertices: {report.deformation.nonFiniteVertices}. Lowest surface:{' '}
                  {(report.deformation.minY * 100).toFixed(2)} cm relative to the grid.
                </p>
                <p>
                  Maximum edge growth:{' '}
                  {(
                    Math.max(...report.deformation.meshes.map((mesh) => mesh.maxEdgeGrowth)) * 100
                  ).toFixed(2)}{' '}
                  cm. See the full report for affected vertices, bones and clip time. This is a
                  diagnostic, not a correction or a guarantee against every possible skinning
                  defect.
                </p>
              </>
            )}
            <details>
              <summary>Meshes and materials ({report.animated.meshes.length})</summary>
              <ul>
                {report.animated.meshes.map((mesh) => (
                  <li key={mesh.name}>
                    <strong>{mesh.name}</strong> · {mesh.character ? 'Shaq' : 'auxiliary'}
                    <br />
                    {mesh.vertices.toLocaleString()} vertices · {mesh.triangles.toLocaleString()}{' '}
                    triangles · {mesh.joints} joints
                    <br />
                    {mesh.materials
                      .map((m) => `${m.name}${m.colorMap ? ' [color texture]' : ''}`)
                      .join(', ')}
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Full inspection report / bone hierarchy</summary>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </>
        )}
      </aside>
    </main>
  );
}
