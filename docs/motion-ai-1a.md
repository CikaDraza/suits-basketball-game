# MOTION-AI-1A — implementation report

Branch: `feat/motion-ai-1a-foundation`. The frontend remains in `src/`; no gameplay,
input mapping, animation, physics or model files changed. No deployment or merge
is included.

## Delivered

- [Motion Analysis Contract](motion-analysis-contract.md): authority, provenance,
  separate reliability/confidence categories, evidence limits and advisory output.
- `shared/motion-diagnostics/`: versioned recording validation, evidence types and
  a strict proposed-report schema. Empty findings are valid; code is inert text.
- `server/src/`: Express health/preparation endpoints, developer authentication,
  intake limits, recording validation and allowlisted evidence minimization.
- `server/src/services/openaiMotionAgent.ts`: official Responses SDK adapter,
  structured output validation and sanitized failures, without a paid HTTP route.
- `server/tests/`: contracts, privacy, HTTP admission and injected provider tests.
- Root package scripts/lockfile: two small npm workspaces and integrated checks.

The preparation endpoint does not call OpenAI, save recordings, inspect repository
files or change the running game. It discloses sampling omissions and unverified
recorded build identities. Its SHA-256 identifies normalized validated JSON, not
the original file bytes. Missing execution events do not become failure findings.

## Local use

See [server/README.md](../server/README.md). An ignored `server/.env` was prepared
locally with an independent random developer token and file permissions `0600`.
Its OpenAI key and model remain empty. Enter them there as `OPENAI_API_KEY` and
`OPENAI_MODEL`; never use a `VITE_` variable for credentials.

```bash
npm run analysis:dev
npm run analysis:prepare -- path/to/recording.json
```

Run preparation in a second terminal while the API is listening. After setting
the key/model, explicitly run `npm run analysis:provider-check` for a potentially
billable readiness request. It sends a fixed small question, not a recording.

## Verification

- `npm run check`: type checks, lint, formatting, 191 existing unit tests and
  24 backend tests passed locally. Three backend cases use available local DIAG-1
  exports and skip when those ignored local files are absent on another machine.
- `npm run analysis:build` and `npm run build`: passed. The frontend retains its
  existing Vite chunk-size advisory.
- Two Playwright scenarios passed: Duel scene/movement/shot and production
  Training flow, including character selection and return to New Duel. Screenshots
  are under ignored `playtest/motion-ai-1a-browser/`.
- The compiled API and `analysis:prepare` CLI successfully processed the local
  `playtest/diag-1/defense-recording.json` over authenticated loopback HTTP, with
  `aiCalled: false` and evidence below the 64 KiB cap.
- Provider tests use the real SDK with an injected transport and no paid calls.
  Live provider check returned `provider_not_configured` because the key/model
  were blank; live OpenAI access has not been verified.

The two original user-described recordings were not available. Local test exports
verify compatibility, not their reported command counts or orientation intervals.

## Remaining slices

1B adds full-trace command metrics and movement/orientation findings before evidence
selection. 1C connects AI interpretation and conditional code proposals. 1D adds
the browser analysis panel, timeline and report export. Public access additionally
requires per-user authentication and cost budgets; the current gate is for local
developer CLI use. POST-TURN-1 and RS-TOLERANCE-1 remain separate changes.
