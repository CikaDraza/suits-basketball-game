import { useEffect, useState } from 'react';
import { motionRecorder } from '../diagnostics/recorder';
import { motionAudit } from '../diagnostics/motionAudit';
import { useGameStore } from '../state/gameStore';
import type { RightStickSnapshot } from '../input/rightStickDebug';
import { GameplayCommandList } from './GameplayCommandList';

const vector = (v?: { x: number; z: number }) => (v ? `${v.x.toFixed(2)}, ${v.z.toFixed(2)}` : '—');
const read = (slot: number) => ({
  status: motionRecorder.status(),
  view: motionAudit.view(slot),
  timeline: motionRecorder.timeline(slot),
});
export function MotionAuditPanel({
  slot,
  snapshot,
  details,
}: {
  slot: 0 | 1;
  snapshot: RightStickSnapshot | null;
  details: boolean;
}) {
  const session = useGameStore((s) => s.session);
  const legend = useGameStore((s) => s.legends[slot]);
  const screen = useGameStore((s) => s.screen);
  const [data, setData] = useState(() => read(slot));
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setData(read(slot)), 100);
    return () => window.clearInterval(timer);
  }, [slot]);
  const { status, view, timeline } = data;
  const latest = view.commands[0];
  const locomotion = view.animation?.locomotion;
  const walk = locomotion?.importedWalk;
  const defense = locomotion?.importedDefense;
  const input = view.input as {
    x: number;
    z: number;
    q: boolean;
    r: boolean;
    inbound?: boolean;
    source: string;
  } | null;
  const pad = view.gamepad as {
    axes: number[];
    buttons: { index: number; pressed: boolean; value: number }[];
    gate: string | null;
    mapped: { opponentDirection: { relative: number } | null };
  } | null;
  const physics = view.physics as {
    players: {
      velocity: { x: number; z: number } | null;
      controlledVelocity: { x: number; z: number };
    }[];
    ball: {
      active: boolean;
      state: string;
      owner: number;
      velocity: { x: number; y: number; z: number } | null;
      control: { phase: number; hand: number; skill: { kind: string } | null };
    };
  } | null;
  const download = (recentOnly: boolean) => {
    try {
      const json = motionRecorder.export(recentOnly);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `suits-motion-${recentOnly ? 'recent' : 'capture'}-${legend}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError('');
    } catch {
      setExportError('Export failed. The recording is still kept locally; try again.');
    }
  };
  return (
    <section className="motion-audit" aria-label="Motion audit">
      <div className="motion-audit-toolbar">
        <button
          type="button"
          disabled={status.state === 'recording'}
          onClick={() => {
            motionRecorder.start();
            setData(read(slot));
          }}
        >
          ● RECORD
        </button>
        <button
          type="button"
          disabled={status.state !== 'recording'}
          onClick={() => {
            motionRecorder.stop();
            setData(read(slot));
          }}
        >
          STOP
        </button>
        <button type="button" onClick={() => download(false)}>
          EXPORT JSON
        </button>
        <button type="button" onClick={() => download(true)}>
          RECENT 30s JSON
        </button>
      </div>
      <p className={status.state === 'recording' ? 'motion-recording' : ''} role="status">
        {status.state.toUpperCase()} · {status.events} events · {status.samples} samples
        {status.stopReason && ` · ${status.stopReason}`}
      </p>
      {details && (
        <>
          <h3>COMMAND</h3>
          <dl>
            <dt>Last request</dt>
            <dd data-testid="motion-intent">{latest?.action ?? 'none'}</dd>
            <dt>Decision</dt>
            <dd data-testid="motion-decision">{latest?.decision?.stage ?? 'pending'}</dd>
            <dt>Reason</dt>
            <dd>{latest?.decision?.reason ?? '—'}</dd>
            <dt>Command ID</dt>
            <dd>{latest?.id ?? '—'}</dd>
            <dt>Gameplay effect</dt>
            <dd data-testid="gameplay-effect">
              {view.commands[0]?.execution
                ? String(view.commands[0].execution.data.evidence ?? 'state changed')
                : 'No execution evidence'}
            </dd>
            <dt>Final pose observed</dt>
            <dd data-testid="gameplay-observed">
              {view.commands[0]?.observation
                ? 'yes · final Character pass'
                : 'No correlated observation'}
            </dd>
          </dl>
          <dl>
            <dt>Actual mode / pose</dt>
            <dd data-testid="motion-active-pose">
              {view.animation?.mode ?? '—'} / {view.animation?.defense ?? '—'}
            </dd>
          </dl>
        </>
      )}
      <p>
        Local JSON only · recent 30s · recording limit 60s. Recording continues with the widget
        closed.
      </p>
      {exportError && <p role="alert">{exportError}</p>}
      {details && (
        <>
          <h3>INPUT</h3>
          <dl>
            <dt>Character / session</dt>
            <dd>
              {legend} / {session.kind === 'duel' ? 'Duel' : session.drill}
            </dd>
            <dt>Screen</dt>
            <dd>{screen}</dd>
            <dt>LS merged</dt>
            <dd data-testid="motion-ls">
              {vector(input ? { x: input.x, z: input.z } : undefined)}
            </dd>
            <dt>LS physical axes</dt>
            <dd>
              {pad?.axes
                .slice(0, 2)
                .map((v) => v.toFixed(2))
                .join(', ') || '—'}
            </dd>
            <dt>RS processed</dt>
            <dd>{snapshot ? vector(snapshot.processed) : '—'}</dd>
            <dt>Source / gate</dt>
            <dd>
              {input?.source ?? '—'} / {pad?.gate ?? 'ready'}
            </dd>
            <dt>Last keyboard / touch</dt>
            <dd>
              {view.physicalInput
                ? `${view.physicalInput.source} · ${JSON.stringify(view.physicalInput.data)}`
                : 'none'}
            </dd>
            <dt>Physical buttons</dt>
            <dd>
              {pad?.buttons
                .filter((b) => b.pressed || b.value > 0.1)
                .map((b) => `${b.index}:${b.value.toFixed(2)}`)
                .join(' ') || 'none'}
            </dd>
            <dt>Mapped buttons</dt>
            <dd>
              {input
                ? [input.q && 'STANCE', input.r && 'PRIMARY', input.inbound && 'INBOUND']
                    .filter(Boolean)
                    .join(' ') || 'none'
                : '—'}
            </dd>
            <dt>Facing / opponent</dt>
            <dd>
              {snapshot ? `${((snapshot.bodyFacing * 180) / Math.PI).toFixed(1)}°` : '—'} /{' '}
              {pad?.mapped.opponentDirection
                ? `${((pad.mapped.opponentDirection.relative * 180) / Math.PI).toFixed(1)}° relative`
                : 'absent'}
            </dd>
          </dl>
          <h3>BODY</h3>
          <dl>
            <dt>Posture / upper body</dt>
            <dd data-testid="gameplay-posture">
              {locomotion?.posture ?? '—'} / {locomotion?.upper ?? '—'}
            </dd>
            <dt>Active mode / pose</dt>
            <dd>
              {view.animation?.mode ?? '—'} / {view.animation?.defense ?? '—'}
            </dd>
            <dt>Arms owner</dt>
            <dd>{view.animation?.layers.arms ?? '—'}</dd>
            <dt>Legs / feet</dt>
            <dd>
              {view.animation?.layers.legs ?? '—'} / {view.animation?.layers.feet ?? '—'}
            </dd>
            <dt>Torso owner</dt>
            <dd data-testid="gameplay-torso">{view.animation?.layers.torso ?? '—'}</dd>
            <dt>Head owner</dt>
            <dd>{view.animation?.layers.head ?? '—'}</dd>
            <dt>Walk clip</dt>
            <dd data-testid="gameplay-walk-clip">
              {walk && walk.applied > 0
                ? `${walk.clip} · ${(walk.weight * 100).toFixed(0)}% · phase ${walk.phase.toFixed(2)} · ${walk.applied} bones`
                : 'inactive'}
            </dd>
            <dt>Defense clip</dt>
            <dd data-testid="gameplay-defense-clip">
              {defense && defense.applied > 0
                ? `${defense.clip} · ${defense.phase} · ${(defense.weight * 100).toFixed(0)}% · ${defense.time.toFixed(2)} / ${defense.duration.toFixed(2)} s · ${defense.applied} bones (${defense.appliedLower} lower)`
                : 'inactive'}
            </dd>
            <dt>Measured body speed</dt>
            <dd>{locomotion ? `${locomotion.speed.toFixed(2)} m/s` : '—'}</dd>
            <dt>Grounded / feet planted</dt>
            <dd>
              {locomotion
                ? `${locomotion.grounded ? 'yes' : 'no'} / ${locomotion.feet.map((foot) => (foot.planted ? 'yes' : 'no')).join(', ')}`
                : '—'}
            </dd>
            <dt>Locomotion / phase</dt>
            <dd>
              {view.animation?.locomotion?.locomotion ?? '—'} /{' '}
              {view.animation?.locomotion?.phase.toFixed(2) ?? '—'}
            </dd>
            <dt>Actual velocity X/Z</dt>
            <dd>{vector(physics?.players[slot]?.velocity ?? undefined)}</dd>
            <dt>Threshold checks</dt>
            <dd>
              {view.warnings.length
                ? view.warnings
                    .map(
                      (w) =>
                        `${w.part} ${w.rule}: ${w.measured.toFixed(2)} ${w.comparison ?? '>'} ${w.threshold} ${w.unit}`,
                    )
                    .join('; ')
                : 'No active threshold warnings'}
            </dd>
          </dl>
          <p>
            Measured thresholds only; anatomy and visual quality still require review. Joint
            positions, quaternions, elbows and palm errors are included in JSON.
          </p>
          <h3>BALL</h3>
          <dl>
            <dt>Active / state</dt>
            <dd>
              {physics?.ball.active ? 'yes' : 'no'} / {physics?.ball.state ?? '—'}
            </dd>
            <dt>Owner / hand</dt>
            <dd>
              {physics?.ball.owner ?? '—'} / {physics?.ball.control.hand ?? '—'}
            </dd>
            <dt>Skill / phase</dt>
            <dd>
              {physics?.ball.control.skill?.kind ?? 'none'} /{' '}
              {physics?.ball.control.phase.toFixed(2) ?? '—'}
            </dd>
          </dl>
          <GameplayCommandList commands={view.commands} />
          <h3>TIMELINE · latest 20</h3>
          <ol className="motion-timeline" aria-label="Motion event timeline">
            {timeline.map((e) => (
              <li key={e.sequence} className={e.type.endsWith('rejected') ? 'motion-rejected' : ''}>
                <span>
                  #{e.sequence} · R{e.revision}/T{e.tick} · {e.simulationTime.toFixed(3)}s
                </span>
                <b>
                  {e.type}
                  {e.action ? ` · ${e.action}` : ''}
                </b>
                {e.reason && <em>{e.reason}</em>}
                <details>
                  <summary>Data</summary>
                  <pre>{JSON.stringify(e.data, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
