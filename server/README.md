# SUITS analysis API — MOTION-AI-1A

For deployment in the existing Vite Vercel project, use the
[Vercel Functions foundation](../docs/motion-ai-vercel-foundation.md). It reuses
the shared validator/projection without a persistent Express process. The local
runner and its larger raw-recording endpoint remain available below.

The game frontend remains in `src/`. This Node.js/Express API validates and prepares
local Motion Diagnostics v1 recordings. It is a developer foundation; it does not
change gameplay, run semantic motion detectors, expose paid AI analysis or add an
Analyze button. Those are the next slices in
[Motion Analysis Contract](../docs/motion-analysis-contract.md).

## Local use

Install dependencies from the repository root with `npm install` (or `npm ci`).
Use Node.js 24.x, matching the root workspace and Vercel runtime pin.

Use `server/.env`. A local ignored file may already have been prepared with an
independent developer token; the OpenAI values remain empty. If it does not exist,
copy `server/.env.example` to `server/.env` and set `MOTION_ANALYSIS_TOKEN` to a
random token of at least 32 characters. Never commit this file or use `VITE_*` for
credentials. The bearer token is for a developer CLI, not browser authentication.

Start the API from the repository root:

```bash
npm run analysis:dev
```

Health: `http://127.0.0.1:3001/health`. The Vite game continues to run separately
with its existing `npm run dev` command.

In a second terminal, prepare a local recording without an OpenAI request:

```bash
npm run analysis:prepare -- playtest/diag-1/defense-recording.json
```

The final JSON object has `aiCalled: false` and contains minimized evidence. npm
also prints its normal script banners. The CLI reads only the explicitly selected
local file and sends it to the loopback API. The API does not read repository
files or save recordings.

For direct HTTP access, POST an envelope `{ "recording": <exported JSON> }` to
`/api/motion-analysis/prepare` with `Content-Type: application/json` and
`Authorization: Bearer <developer token>`. No browser origin is accepted in 1A.
Do not embed that token in the frontend. Public browser auth is separate future
work, not solved by putting a static token into Vite env.

## OpenAI provider check

Set these **only in `server/.env`**, using a model enabled for your OpenAI project
that supports Responses Structured Outputs:

```dotenv
OPENAI_API_KEY=your-project-key
OPENAI_MODEL=your-enabled-structured-output-model
OPENAI_MAX_OUTPUT_TOKENS=2048
```

Then explicitly run:

```bash
npm run analysis:provider-check
```

This is an opt-in, potentially billable API request with a fixed tiny question;
it sends no recording. The key/model are not automatically checked on startup.
The server adapter uses the official SDK, `responses.parse`, a strict shared schema,
`store: false`, no tools, no retries, a 20-second timeout and bounded output tokens.
Missing keys, refusal, invalid output, incomplete response, provider auth/rate errors
and timeouts are sanitized failures. The adapter is tested with an injected HTTP
transport; 1A does not expose it as a paid HTTP analysis endpoint.

`store: false` is not a claim of zero provider abuse-monitoring retention.
The API key and provider responses are never printed in an error message.

## Build and checks

```bash
npm run analysis:build
npm run analysis:test
npm run typecheck
npm run check
```

`npm run build` still builds the Vite frontend. After `analysis:build`, the compiled
server can run with `npm start -w @suits/analysis-api`. The shared-contract workspace
is built automatically by the root analysis scripts; rebuild/restart after shared
schema edits. No frontend folder migration is needed.

The API defaults to loopback. For a future container service, explicitly set
`HOST=0.0.0.0` and use the platform's `PORT`; set the developer token and OpenAI
credentials in server secrets. No hosting resources are provisioned by 1A. The
rate limiter is single-process and does not replace public per-user auth or cost
budgets. Bodies are limited to 10 MiB, compression is disabled, JSON complexity
is bounded and evidence is limited to 64 KiB. Full details are in the contract.

The recording SHA-256 identifies `JSON.stringify()` of the validated recording,
not the original pretty-printed file's bytes. It provides correlation, not source
attestation. Recorded code revisions are always unverified without matching code.
