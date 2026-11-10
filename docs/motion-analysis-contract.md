# SUITS Motion Analysis Contract v1

MOTION-AI-1A establishes this boundary before adding gameplay analytics or UI.
The frontend stays in `src/`. The developer API lives in `server/`; schemas and
report types live in `shared/motion-diagnostics/`.

## Authority

Gameplay alone determines simulation state. The recorder is an observer. The
future deterministic analyzer calculates reproducible metrics. The model may
interpret only supplied evidence and propose reviewed changes. Neither an HTTP
request nor a model output may execute code, mutate the game, write repository
files, open PRs, invoke external tools, or change physics/animation during play.
Code examples are inert text with `requiresDeveloperReview: true`.

Input reliability, execution reliability and motion correctness are distinct.
Requested/accepted/executed counts do not prove anatomical or visual correctness.
A missing execution event may be a recording/transition gap. A successful push
with `no-opponent` is not a failed command. A valid clean trace may yield no findings.
These semantic analytics belong to MOTION-AI-1B, not the foundation validator.
Earlier recorder clock regressions are flagged as timing caveats, rather than
being silently treated as reliable intervals.

## Recording intake

The API accepts schema `suits.motion-diagnostics`, version 1. Event/sample clocks
include revision, tick, simulation time, monotonic elapsed time and total sequence.
Unknown versions, nonfinite or invalid numeric clocks, duplicate sequence IDs, excessive
nesting/size/counts and contradictory context references fail validation. Unknown
payload fields remain diagnostic data; they never become executable instructions.
A command begun outside a retained window is allowed and must not be counted as
an execution failure.

Limits are independent of the browser recorder: up to 10 MiB JSON, 20,000 events,
10,000 samples, 128 contexts and 32 JSON nesting levels. Collections also have bounded widths. This accommodates existing
multi-MB exports without trusting arbitrary client-specified limits. Compressed
request bodies are rejected so compressed size cannot bypass the intake limit.
Validation happens before any provider request. No database or recording files are
written by the API; request bodies and credentials are not logged.

## Foundation endpoints

The deployable same-project Vercel entry points and compact transport are described
in [Vercel Node.js API Foundation](motion-ai-vercel-foundation.md). `GET /api/health`
and `POST /api/motion/analyze` run as Functions. The latter returns preparation
only (`aiCalled: false`, `analysisStatus: not-implemented`) until 1B. Its 96 KiB
request/64 KiB evidence limits replace the local raw intake limit on Vercel.
Original hash, source identity and totals supplied in compact evidence are client
assertions, not server attestation. Sample omissions prevent full-trace metrics.

The following endpoints remain available in the optional local Express runner:

- `GET /health`: process health, no credential/configuration details.
- `POST /api/motion-analysis/prepare`: developer authentication, request limits,
  recording validation, SHA-256 identity, provenance assessment and a bounded,
  allowlisted evidence packet. It never calls OpenAI.

MOTION-AI-1A prepares and tests a server-only Responses adapter against that packet
and the proposed report schema. It is not an exposed paid analysis endpoint.
Paid analysis, semantic detectors and the frontend Analyze button belong to 1B–1D.
A separate explicit provider-check CLI sends only
a fixed small readiness question, never a recording.

## Evidence minimization and provenance

The preparation step excludes controller identifiers, browser/user-agent details,
full settings/bindings, arbitrary config, initial-state blobs and unknown strings.
It keeps bounded numeric/state evidence and event/sample IDs. Every truncation and
omission is disclosed. The prepared JSON has a separate size cap and does not
substitute for the original recording. A future question-specific evidence builder
may refine window selection without changing original event identities.

The recording hash identifies the normalized validated JSON, not the original
pretty-printed file bytes.

Source identity is an assertion in the recording, not trusted server code evidence.
`dirtyAtServerStart`, commit mismatches, missing identity and source hashes observed
only at dev-server startup must be reported. In 1A no matching source file is
provided to the model, so source verification is always `unverified`, root cause
cannot be marked code-confirmed, and code proposals remain conditional. No remote
staging state is inferred from a local checkout. Initial-state data does not turn
this diagnostic format into deterministic replay.

## Proposed report

A versioned structured report separates problem, expected/actual behavior,
evidence references, cause status, observation/root-cause/proposed-fix confidence,
recommendation, inert code example, risk and verification. `findings: []` is valid.
Evidence IDs must exist in the prepared packet. Unknown IDs or invalid output
fail closed; there is no fallback to an unvalidated prose response. Findings remain
`proposed`. The SDK receives fixed server instructions and explicitly untrusted
data, has no tools, uses `store: false`, a timeout, no automatic retries and bounded
output tokens. Provider refusal, incomplete/invalid output and network failures
are distinct sanitized application errors.

`store: false` disables Responses application-state storage; it is not a promise
that the provider has no abuse-monitoring retention. No recording is sent in 1A's
HTTP preparation endpoint.

## Access and costs

A server-only `MOTION_ANALYSIS_TOKEN` authenticates developer CLI requests. It is
not a browser credential and must never become `VITE_*`. The server defaults to
loopback, rejects unexpected browser origins, does not trust forwarded IP headers,
and rate-limits authenticated and unauthenticated callers before parsing bodies.
The key is exclusively `server/.env` / server secrets as `OPENAI_API_KEY`.
`OPENAI_MODEL` must be configured explicitly for provider access; no model is
silently substituted. Public per-user auth and durable distributed quotas are
future deployment work. 1A's single-process developer gate is not multi-user auth.

All provider calls are opt-in. No recording is automatically analyzed on load,
record, Stop, export, gameplay frame, or preparation. Provider live testing requires
a configured key/model; test transports use no paid requests. A later public
analysis endpoint must add per-user cost budgets before rollout.

## Slice boundaries and first-recording claims

1A: contracts, validation/preparation, developer API, safe provider adapter/check.
1B: deterministic command metrics, movement/orientation windows and findings.
1C: connected AI interpretation, calibrated confidence and code proposals.
1D: frontend analysis panel, timeline, report export and user-triggered submission.
POST-TURN-1 and RS-TOLERANCE-1 are separate gameplay/input changes.

The two described user recordings are not attached to this request. Their reported
counts and time windows are user-supplied observations, not verified outputs of
this implementation. Local recorder test exports may be used as compatibility
fixtures, clearly labeled as such. The current code retains `p.mode !== 'post'`
in movement-facing selection; its post-up target branch also has an existing
`!freeMovement()` guard. These are local code facts, not proof that the cited
recordings were made from this exact source version.

## Primary API references

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)
- [Express 5 API](https://expressjs.com/en/5x/api/)
