import { useState } from 'react';
import type { GameplayCommand } from '../diagnostics/gameplayCommands';

export function GameplayCommandList({ commands }: { commands: GameplayCommand[] }) {
  const [filter, setFilter] = useState('all');
  const rows = commands.filter((command) =>
    filter === 'all'
      ? true
      : filter === 'rejected'
        ? command.decision?.stage === 'rejected' || command.decision?.stage === 'cancelled'
        : filter === 'waiting'
          ? !command.execution &&
            !command.ended &&
            command.decision?.stage !== 'rejected' &&
            command.decision?.stage !== 'cancelled'
          : command.action === filter ||
            (filter === 'stance_or_special' && command.action === 'stance'),
  );
  return (
    <section aria-label="Gameplay command history">
      <h3>COMMAND HISTORY · latest 32</h3>
      <label>
        Filter commands
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All commands</option>
          <option value="rejected">Rejected / cancelled</option>
          <option value="waiting">Awaiting execution</option>
          <option value="move">Movement</option>
          <option value="stance_or_special">Stance / special</option>
          <option value="inbound">Inbound</option>
        </select>
      </label>
      <p>Decisions, gameplay effects and final pose observations are separate evidence.</p>
      {!rows.length && <p>No matching commands in this session.</p>}
      <ol className="gameplay-commands">
        {rows.map((command) => (
          <li key={command.id} data-testid="gameplay-command" data-action={command.action}>
            <details>
              <summary>
                #{command.id} · {command.action} · {command.decision?.stage ?? 'requested'}
                {command.execution ? ' · executed' : ''}
                {command.ended ? ' · ended' : ''}
              </summary>
              <dl>
                <dt>Requested</dt>
                <dd>
                  R{command.revision} · {command.requestedAt.toFixed(3)} s
                </dd>
                <dt>Decision</dt>
                <dd>{command.decision?.stage ?? 'pending'}</dd>
                <dt>Reason</dt>
                <dd>{command.decision?.reason ?? '—'}</dd>
                <dt>Gameplay effect</dt>
                <dd>
                  {command.execution
                    ? `${command.execution.simulationTime.toFixed(3)} s · ${command.execution.data.evidence ?? 'state changed'}`
                    : 'No execution evidence'}
                </dd>
                <dt>Final pose</dt>
                <dd>
                  {command.observation
                    ? `${command.observation.simulationTime.toFixed(3)} s · ${command.observation.data.mode}`
                    : 'No correlated pose observation'}
                </dd>
              </dl>
              <details>
                <summary>Execution / pose data</summary>
                <pre>
                  {JSON.stringify(
                    { execution: command.execution, pose: command.observation },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
