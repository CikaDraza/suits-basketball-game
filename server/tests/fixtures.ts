import type { AnalysisReport } from '@suits/motion-contracts';
import { parseRecording } from '../src/services/diagnosticParser.js';
import { buildEvidence } from '../src/services/evidenceBuilder.js';

export const token = 'development-test-token-0123456789abcdef';
export function recording() {
  return {
    schema: 'suits.motion-diagnostics',
    schemaVersion: 1,
    mode: 'capture',
    replay: { supported: false },
    contexts: [
      {
        revision: 1,
        elapsedMs: 0,
        initialState: { secretInInitialState: 'DO_NOT_FORWARD_INITIAL_STATE' },
        metadata: {
          session: { kind: 'training', drill: 'movement' },
          legends: ['shaq', 'chuck'],
          build: {
            commit: 'a'.repeat(40),
            dirtyAtServerStart: true,
            codeSha256AtServerStart: 'b'.repeat(64),
          },
          environment: { userAgent: 'PRIVATE_BROWSER' },
          controls: { private: 'PRIVATE_BINDING' },
        },
      },
    ],
    events: [
      {
        sequence: 1,
        revision: 1,
        tick: 20,
        simulationTime: 0.3,
        elapsedMs: 300,
        type: 'command.requested',
        slot: 0,
        action: 'defense_left',
        data: { device: 'PRIVATE_CONTROLLER', gesture: { hand: 1, facing: 0 } },
      },
      {
        sequence: 2,
        revision: 1,
        tick: 20,
        simulationTime: 0.3,
        elapsedMs: 301,
        type: 'command.accepted',
        slot: 0,
        action: 'defense_left',
        commandId: 1,
        data: {},
      },
      {
        sequence: 3,
        revision: 1,
        tick: 20,
        simulationTime: 0.3,
        elapsedMs: 302,
        type: 'command.executed',
        slot: 0,
        action: 'defense_left',
        commandId: 1,
        data: {},
      },
      {
        sequence: 4,
        revision: 1,
        tick: 21,
        simulationTime: 0.35,
        elapsedMs: 350,
        type: 'contact.push',
        slot: 0,
        reason: 'no-opponent',
        data: { target: null, impulse: null },
      },
    ],
    samples: [
      {
        sequence: 5,
        revision: 1,
        tick: 22,
        simulationTime: 0.4,
        elapsedMs: 400,
        channel: 'simulation',
        data: {
          players: [{ active: true, facing: 0, mode: 'post', position: { x: 1, y: 1, z: 2 } }],
          ball: { state: 'inactive', owner: -1, active: false },
        },
      },
    ],
    droppedEvents: 0,
    droppedSamples: 0,
  };
}
export function prepared() {
  const parsed = parseRecording(recording());
  return buildEvidence(parsed.recording, parsed.warnings);
}
export function report(): AnalysisReport {
  return {
    schema: 'suits.motion-analysis',
    schemaVersion: 1,
    recordingSha256: prepared().recordingSha256,
    summary: 'Insufficient evidence for a gameplay defect.',
    sourceVerification: 'unverified',
    reliability: {
      input: 'The excerpt records a requested defense command.',
      execution: 'The command has an execution event.',
      motion: 'Visual correctness is not established by these events.',
    },
    findings: [],
    limitations: ['No matching source files or screenshots were provided.'],
  };
}
