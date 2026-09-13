# One Card Spike 1 Implementation Plan

**Goal:** Implement the user-approved development spike through story-ID retrieval, with live execution blocked until an evidenced authentication method exists.

**Architecture:** A development-only Next client talks to an isolated content script using FEWCLONE messages. The MV3 worker owns orchestration and a closed Graph request builder. Authentication fails closed; offline tests inject synthetic transport responses, never browser credentials.

**Tech Stack:** Next.js App Router, JavaScript MV3 modules, Node test runner.

**Spec:** User SPIKE 1 instructions and `docs/fewfeed-one-card-web-flow.md`.

## Constraints

- Only localhost:3000 and `/dev/one-card-spike`, top frame.
- Only adimages POST, adcreatives POST, creative GET.
- Immediate first GET; 15 attempts maximum; 4000 ms between empty results.
- No extractor, publish, schedule, GraphQL, campaign, adset, Ad, commit, or push.

## Execution

- [x] Write `extension/core.test.mjs` for closed operations, payload mapping, bounded polling, sanitized messages, and auth-before-network; run `node --test extension/core.test.mjs` to observe failure.
- [x] Implement `extension/core.mjs`: strict input validator, `buildRequest(operation, input)`, `runSpike(input, dependencies)`, and fixed error envelopes. Implement `extension/auth.mjs` returning AUTH_BLOCKED. Run tests again.
- [x] Add `extension/manifest.json`, `background.js`, and `content.js`; test the real bridge with offline browser mocks. No injected page-world script is needed for window.postMessage.
- [x] Add server development gate and client form in `app/dev/one-card-spike/`, including detection timeout and allowlisted progress display.
- [x] Document installation, endpoints, auth blocker, and validation in `docs/one-card-spike-1.md`.
- [x] Run offline tests, scoped ESLint, TypeScript/build, inspect diffs; leave changes uncommitted for review.
