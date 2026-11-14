import { motionRecorder } from '../diagnostics/recorder';
import { MotionAuditPanel } from './MotionAuditPanel';
import { useEffect, useState } from 'react';
import { rightStickDebug, type RightStickSnapshot } from '../input/rightStickDebug';
import { isFreeMovement, useGameStore } from '../state/gameStore';
import { useHarnessStore } from '../state/harnessStore';
import './right-stick-debug.css';

const degrees = (angle: number) => `${((angle * 180) / Math.PI).toFixed(1)}°`;
const vector = (v: { x: number; z: number }) => `${v.x.toFixed(3)}, ${v.z.toFixed(3)}`;

/** Development-only DOM observer; sampling never writes to the game or starts a 3D loop. */
export function GameplayDebugOverlay() {
  const visible = useHarnessStore((s) => s.debugRightStick);
  const movement = useGameStore((s) => isFreeMovement(s.session));
  const playing = useGameStore((s) => s.screen === 'playing');
  const [slot, setSlot] = useState<0 | 1>(0);
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(
      () => setRecording(motionRecorder.status().state === 'recording'),
      250,
    );
    return () => window.clearInterval(timer);
  }, []);
  const [tab, setTab] = useState<'audit' | 'rs'>('audit');
  const [snapshot, setSnapshot] = useState<RightStickSnapshot | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('gameplayDebug') || params.has('rightStickDebug'))
      useHarnessStore.getState().setDebugRightStick(true);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const update = () => setSnapshot(rightStickDebug[movement ? 0 : slot]);
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [visible, playing, slot, movement]);

  return (
    <aside
      className="right-stick-debug"
      aria-label="Gameplay diagnostics"
      onPointerDown={(event) => {
        if (event.target instanceof HTMLButtonElement) event.preventDefault();
      }}
    >
      <button
        type="button"
        aria-expanded={visible}
        onClick={() => useHarnessStore.getState().setDebugRightStick(!visible)}
      >
        Gameplay Debug {recording ? '● REC ' : ''}
        {visible ? '−' : '+'}
      </button>
      {visible && (
        <div className="right-stick-debug-panel">
          <h2>SUITS GAMEPLAY DEBUG</h2>
          <div className="motion-tabs" role="group" aria-label="Diagnostic views">
            <button type="button" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>
              GAMEPLAY
            </button>
            <button type="button" aria-pressed={tab === 'rs'} onClick={() => setTab('rs')}>
              RS DETAILS
            </button>
          </div>
          <label>
            Player{' '}
            <select
              value={movement ? 0 : slot}
              onChange={(e) => setSlot(Number(e.target.value) as 0 | 1)}
            >
              <option value={0}>P1</option>
              {!movement && <option value={1}>P2</option>}
            </select>
          </label>
          <MotionAuditPanel
            key={movement ? 0 : slot}
            slot={movement ? 0 : slot}
            snapshot={snapshot}
            details={tab === 'audit'}
          />
          {tab === 'rs' && snapshot && (
            <strong data-testid="right-stick-action">
              {snapshot.legend} · {snapshot.context} · {snapshot.selected}
            </strong>
          )}
          {tab === 'rs' &&
            (!snapshot ? (
              <p>Waiting for an input frame…</p>
            ) : (
              <>
                <svg
                  viewBox="0 0 300 150"
                  role="img"
                  aria-label="Green: character forward. Orange: physical stick direction."
                >
                  <defs>
                    <marker
                      id="rs-forward"
                      markerWidth="7"
                      markerHeight="7"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L6,3 Z" fill="#83e6ae" />
                    </marker>
                    <marker
                      id="rs-stick"
                      markerWidth="7"
                      markerHeight="7"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L6,3 Z" fill="#ffbd69" />
                    </marker>
                  </defs>
                  <circle cx="150" cy="75" r="57" fill="none" stroke="#6d8090" />
                  <path d="M150 12 V138 M87 75 H213" stroke="#394957" />
                  <line
                    x1="150"
                    y1="75"
                    x2={150 + snapshot.screenForward.x * 48}
                    y2={75 - snapshot.screenForward.z * 48}
                    stroke="#83e6ae"
                    strokeWidth="3"
                    markerEnd="url(#rs-forward)"
                  />
                  <line
                    x1="150"
                    y1="75"
                    x2={150 + snapshot.processed.x * 55}
                    y2={75 - snapshot.processed.z * 55}
                    stroke="#ffbd69"
                    strokeWidth="2"
                    markerEnd="url(#rs-stick)"
                  />
                  <text x="6" y="20" fill="#83e6ae">
                    Body forward
                  </text>
                  <text x="6" y="40" fill="#ffbd69">
                    Stick
                  </text>
                  <text x="6" y="135" fill="#e9f0f5">
                    {snapshot.phase}
                  </text>
                </svg>
                <dl>
                  <dt>Executing skill</dt>
                  <dd>{snapshot.executing}</dd>
                  <dt>Last accepted</dt>
                  <dd>{snapshot.accepted?.kind ?? '—'}</dd>
                  <dt>Map L/R/U/D</dt>
                  <dd>
                    {Object.values(snapshot.bindings)
                      .map((b) =>
                        b?.kind === 'axis' ? `${b.index}${b.sign < 0 ? '−' : '+'}` : '—',
                      )
                      .join(' / ')}
                  </dd>
                  <dt>Axis 2 / 3</dt>
                  <dd>
                    {snapshot.rawAxes.axis2.toFixed(3)}, {snapshot.rawAxes.axis3.toFixed(3)}
                  </dd>
                  <dt>Mapped raw</dt>
                  <dd>{vector(snapshot.calibrated)}</dd>
                  <dt>Deadzone out</dt>
                  <dd>{vector(snapshot.processed)}</dd>
                  <dt>Normalized</dt>
                  <dd>{vector(snapshot.normalized)}</dd>
                  <dt>Body left / fwd</dt>
                  <dd>
                    {snapshot.bodyRelative.left.toFixed(3)},{' '}
                    {snapshot.bodyRelative.forward.toFixed(3)}
                  </dd>
                  <dt>Candidate</dt>
                  <dd>
                    {snapshot.resolved ?? 'neutral'}{' '}
                    {snapshot.resolved === 'side'
                      ? snapshot.anatomicalHand === 1
                        ? '(left)'
                        : '(right)'
                      : ''}
                  </dd>
                  <dt>Body / locked</dt>
                  <dd>
                    {degrees(snapshot.bodyFacing)} /{' '}
                    {snapshot.lockedFacing === null ? '—' : degrees(snapshot.lockedFacing)}
                  </dd>
                  <dt>Camera yaw / pitch</dt>
                  <dd>
                    {degrees(snapshot.cameraYaw)} / {degrees(snapshot.cameraPitch)}
                  </dd>
                  <dt>Movement yaw</dt>
                  <dd>{degrees(snapshot.movementYaw)}</dd>
                  <dt>Gate</dt>
                  <dd>
                    {!snapshot.device
                      ? 'no pad'
                      : snapshot.enabled
                        ? snapshot.eligible
                          ? 'ready'
                          : 'ineligible'
                        : 'neutral required'}
                  </dd>
                </dl>
                <p>Screen right/up coordinates. Defense stays locked until neutral.</p>
              </>
            ))}
        </div>
      )}
    </aside>
  );
}
