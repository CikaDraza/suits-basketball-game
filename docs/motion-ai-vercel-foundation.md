# MOTION-AI-1A — Vercel Node.js API Foundation

The existing Vite project now includes Node.js Functions in `api/`. No second
Vercel project, domain, database, Blob store or persistent server is required.
The earlier Express runner remains an optional local tool; it is not imported by
either deployed function. Gameplay and the diagnostic recorder are unchanged.

## Endpoints and slice boundary

`GET /api/health` returns process health and explicit foundation capabilities.
It does not return environment variables, tokens or provider configuration.

`POST /api/motion/analyze` accepts exactly `{ "evidence": <compact package> }`.
It authenticates a developer, validates structure, size, sequence/context references
and selection counters, then returns `suits.motion-preparation` v1 with:

```json
{
  "status": "prepared",
  "aiCalled": false,
  "analysisStatus": "not-implemented",
  "originalRecordingVerified": false
}
```

This response is a validated preparation result, not a completed motion analysis.
Deterministic command metrics, orientation detectors and connected OpenAI reports
belong to MOTION-AI-1B. No request to this endpoint can spend OpenAI credit in 1A,
even if provider credentials are configured. The existing tested server-only
Responses adapter remains available for that follow-up. No Analyze UI is added.

## Compact evidence

Vercel has a 4.5 MB function request/response limit. This route instead permits
96 KiB of uncompressed request data and at most 64 KiB of evidence, checked while
reading the stream as well as after parsing. Gzip is deliberately unsupported.

`prepareCapture()` in `shared/motion-diagnostics/` is browser-safe and performs
local validation, normalized recording SHA-256 and the same allowlisted projection
used by the local server. It never uploads or loads credentials. To prepare a
recording offline:

```bash
npm run analysis:compact -- path/to/recording.json
```

The final JSON line is the complete request envelope; npm also prints script
banners. For a clean file after building the shared workspace:

```bash
node --import tsx server/src/compactRecording.ts path/to/recording.json > compact.json
```

The projection currently retains up to 120 selected events and 40 samples, with
explicit totals/omissions. It excludes device identifiers, browser information,
bindings, arbitrary strings and full configuration/state blobs. Original JSON
stays local and is not overwritten. This uniform selection is a foundation format;
1B needs full command lifecycle coverage or separately identified analysis windows
before claiming full-recording command reliability. Client totals, source identity
and the original recording hash are assertions; the server cannot attest an absent
original file or matching repository source. Missing execution in selected data
never proves command failure. Server-side caveats cannot be removed by a client.

## Developer access and deployment

Deploy the feature branch as Preview in the existing `suits-basketball-game`
project. `vercel.json` builds the shared workspace before Vite, emits `dist/`,
and sets bounded function durations. The root package pins Node.js `24.x`; a broad
`>=22` range would let Vercel override the project's 24.x setting with Node.js 26.

Configure `MOTION_ANALYSIS_TOKEN` as a Preview Secret with at least 32 characters.
Send it in the HTTP `Authorization: Bearer ...` header using a developer client.
An absent/invalid server token fails closed with 503; missing/bad caller credentials
return 401. Requests carrying a browser Origin are rejected. Do not put the token
in Vite env, a frontend bundle or browser storage. Browser developer identity is
future work before the panel becomes available.

Keep Vercel Deployment Protection enabled. Protected Preview testing additionally
uses the caller's Vercel authentication; application bearer auth is still required.
`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6.1-sol` and `OPENAI_MAX_OUTPUT_TOKENS=2048`
remain server-only configuration for the provider adapter. Health and preparation
do not depend on them. Local HOST/PORT are not Vercel configuration.

The application limiter permits 20 authenticated requests/minute and two active
requests per warm instance. This is best effort across serverless instances, not
a global quota or per-user cost budget. No paid analysis route may be enabled
until shared per-user admission/budgets are implemented. Bodies, keys and tokens
are never logged; unexpected errors log a fixed code only. `.vercelignore` excludes
local secrets and test artifacts from CLI uploads; `.gitignore` excludes `.vercel/`.

## Acceptance evidence

The implementation is checked with shared/browser bundling, handler/auth/limits
tests, existing local HTTP tests and the game build. Private original recordings
and generated compact packages are kept outside Git. Concrete test/deployment
results are recorded in the delivery report/PR; no original counts or motion
findings are inferred from a sampled package in this slice.

Local checks passed: `npm run check` (191 existing unit tests + 32 backend/Functions
tests), frontend/API builds, and two existing Duel/Training browser scenarios with
installed Chrome. All 28 frontend build files were scanned for the actual local
secrets and provider endpoint code; neither was present.

Both original user recordings were validated locally and their compact packages
were accepted by the protected Node.js 24 Preview at commit `3ba1bb4`:

| Recording                                      | Original bytes | Request bytes | Session             | HTTP |
| ---------------------------------------------- | -------------: | ------------: | ------------------- | ---: |
| `suits-motion-capture-shaq-1794326230053.json` |      8,416,404 |        64,815 | `training.movement` |  200 |
| `suits-motion-capture-shaq-1794326347006.json` |      7,152,843 |        64,112 | `duel`              |  200 |

Request sizes include the compact JSON envelope and trailing newline. Training
retains 120 of 867 events and 28 of 628 samples; Duel retains 120 of 745 events and
25 of 477 samples. Omissions are disclosed; these are preparation results, not
full-trace command reliability or motion findings. Both return `aiCalled: false`.
Artifacts are under ignored `playtest/motion-ai-vercel/`.

Preview: [tested deployment](https://suits-basketball-game-7lah8ghuu-cikadrazas-projects.vercel.app).
Health returned 200; missing developer credentials returned 401; browser Origin
returned 403. The initial deployment also returned 503 before access configuration
was present. A real browser opened the Preview game, selected Free Movement and
captured `playtest/motion-ai-vercel/preview-free-movement.png` with no page errors.
A distinct Secret developer token is scoped only to this feature branch's Preview;
the user's Preview configuration remains available to other branches. Production
configuration was not changed. [Draft PR #7](https://github.com/CikaDraza/suits-basketball-game/pull/7)
remains open for visual acceptance; no merge or production promotion is included.

The branch-only developer credential is saved locally in ignored
`server/.env.preview.local` with permissions `0600`; it contains no OpenAI key.
The automation bypass automatically created by the CLI for these tests was revoked
after verification. Deployment Protection remains enabled. No credentials or raw
recordings are part of this PR.

## References

- [Vercel Node.js runtime and Web handlers](https://vercel.com/docs/functions/runtimes/node-js)
- [Vite Functions](https://vercel.com/docs/frameworks/frontend/vite)
- [Function limits](https://vercel.com/docs/functions/limitations)
- [Motion Analysis Contract](motion-analysis-contract.md)
