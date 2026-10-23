# Validation record

This record distinguishes implemented checks from observed results. **No real-provider or published-demo verification is claimed unless its row contains an actual execution reference.**

## Current evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Supported runtime | Not yet run | Initial host shell reports Node v20.20.2/npm 10.8.2; repository targets Node 22 |
| Locked fresh-checkout install | Blocked | Lockfile generation could not resolve all API dependencies from the available offline cache; no package-lock.json or supported-runtime fresh-install proof exists yet |
| Web build/typecheck and shared package builds | Passed, limited local environment | Vite 6.4.1 production build includes TypeScript checking; contracts/core also built with TypeScript 5.9.3 |
| Workspace unit tests | Passed, limited local environment | 19 passed: contracts 2, core 2, API configuration 1, web domain 9 and React render 5; no skips |
| Native automation unit tests | Passed, limited local environment | 8 passed: synthetic corpus/embedding/provider guards, reviewer-link base path, actual TCP SMTP fault fixture and Gmail normalization/safety; no skips |
| Full API build/typecheck | Blocked | Fastify, cookie and PostgreSQL dependency packages are unavailable locally |
| Real PostgreSQL/API integration | Not yet run | Nine authored cases require the unavailable Docker Linux engine |
| Real n8n with controlled providers | Not yet run | Executable workflows and fixture service are checked in; no container execution IDs or topology outputs have been observed |
| Independent whole-flow acceptance | Not yet run | Authored in tests/acceptance and acceptance-matrix.md; requires the actual stack |
| Local desktop/mobile sample browser | Passed, limited local environment | Final integrated app-local suite: 18/18 in 25.2 seconds; final independent suite: 14/14 in 16.6 seconds; zero failures/skips |
| Authenticated live UI → API → n8n → Mailpit | Not yet run | Requires the real fixture Docker stack; local sample evidence does not substitute |
| Published Pages browser | Not yet run | No verified deployment |
| OpenAI live smoke | Not run | Explicit opt-in credentials required; no cost or usage measured |
| Gmail/Slack live integrations | Not run | Optional integrations; no execution or delivery claimed |

## Required execution record

For each run, record date, Git revision, exact command, runtime/service versions, pass/fail/skip counts, and saved output or workflow execution IDs. Provider fixture results must identify the fixture scenarios and observed call counts. A skipped test is not a pass. Screenshots must come from the running application.

## Integrated local checks - 2026-10-23

The integration branch incorporated final web source `bbac1fb` as `1f2d180`, final automation review fixes as `d73a684`, and the evaluation/screenshot follow-up as `d3318cc`. These are local Git commits, not a published deployment. Runtime was Node 20.20.2/npm 10.8.2 with existing public package copies and cached archives. Workspace links were represented by local ignored package copies because native workspace symlinks were unavailable. This does not verify `npm ci` or Node 22.

Observed commands and results:

| Command | Observed result |
| --- | --- |
| `npm run build --workspace @support-flow/web` | Passed, including TypeScript checking and the `/support-flow/` production asset base |
| `npm test` | 19 passed, zero failed/skipped across all four workspaces |
| `npm run test:automation` | 8 passed, zero failed/skipped after the final actual-TCP fixture regression |
| `npm run check:public` | All three built text assets passed the credential-pattern/direct-provider-endpoint scan |
| `node --check automation/scripts/live-evaluation.mjs` | Passed syntax validation; no live provider request made |
| `node --check tests/acceptance/whole-flow.test.mjs` | Passed syntax validation; no actual stack execution claimed |
| `npm run test:web:e2e` | 18 passed, zero failed/skipped in 25.2 seconds against the integrated built preview |

For the browser suite, `WEB_DEMO_URL=http://127.0.0.1:4183/support-flow/` selected the retained integrated preview and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selected the existing Chromium headless-shell revision 1228. Playwright was 1.56.1. Nine scenarios ran in desktop and mobile viewports, including serialized simultaneous cross-tab edits. CI clears this local override and installs the browser belonging to the declared Playwright package.

The coordinating reviewer independently ran the final combined built preview at the same port with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4183/support-flow/`, `PLAYWRIGHT_EXTERNAL_SERVER=1`, and the same existing Chromium executable selected:

```sh
node node_modules/@playwright/test/cli.js test tests/e2e/independent-demo.spec.ts
```

Observed result: **14 passed, zero failed/skipped in 16.6 seconds** on Node 20.20.2, Playwright 1.56.1 and Chromium revision 1228. This confirms the integrated sample artifact independently; it still does not verify the authenticated live stack or a published Pages deployment. The final automation test-only additions and explicit Docker build/import assertions do not change this browser artifact.

## Observed local sample browser run — 2026-10-23

Independent QA ran `tests/e2e/independent-demo.spec.ts` against the web worker's actual built preview at `http://127.0.0.1:4173/support-flow/`. This was an integration working-tree build, not a deployed release. Runtime: Node **20.20.2**, cached Playwright **1.56.1**, and the already installed Chromium headless-shell revision **1228**, selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Playwright's normally pinned revision 1194 was unavailable. This is **not** a Node 22, clean installation, or default-browser-install verification.

Exact command, with the external preview already running and the existing Chromium executable path set in the environment:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 node node_modules/@playwright/test/cli.js test tests/e2e/independent-demo.spec.ts
```

Result: **14 passed, 0 failed, 0 skipped in 11.8 seconds**. Desktop viewport: 1440 × 1000. Mobile: Playwright Pixel 5 profile. Both projects exercised sample disclosure/base path, source inspection, draft revision/approval/reload, blocked specialist approval and keyboard rejection, filters/empty/reset, corrupt-storage restoration, stale cross-tab edits, keyboard focus/dialog Escape, and horizontal viewport fit. Request observation found zero remote requests, failed HTTP requests, JavaScript exceptions or console errors in these scenarios.

A focused desktop rerun after adjusting screenshot scroll position passed **1/1 in 2.7 seconds**:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 node node_modules/@playwright/test/cli.js test tests/e2e/independent-demo.spec.ts --project=desktop -g "revised current"
```

QA captured a screenshot from that focused run after a fictional reviewer edit. The final [README screenshot](screenshots/review-workspace.png) was subsequently refreshed from the web worker's actual final application capture for `bbac1fb`, showing the original prepared draft and its source excerpt. Both captures use fictional data. Browser dependencies came from existing public cached packages; no locked fresh-install claim is made. Native acceptance helpers also passed `node --check` syntax validation; their actual stack scenarios remain unexecuted here.

## Reproducible whole-flow trace

Pending actual execution. The intended trace is: authenticate reviewer; ingest fictional knowledge; submit a unique fictional ticket through the authenticated n8n intake webhook; observe a persisted grounded draft and sources; revise with an expected version; approve the new version; execute dispatch; inspect the received Mailpit message and audit events. Follow with stale approval and repeated dispatch checks.

## Environment and release blockers

- A running Docker Linux engine is unavailable. PostgreSQL/API integration, actual n8n execution, whole-flow recovery and authenticated live UI delivery remain unverified.
- API dependencies and a complete lockfile must be resolved before `npm ci`, Docker image builds and the authored CI workflow can succeed.
- Node 22 clean-checkout verification remains pending; local Node 20 results are a narrower check.
- Published deployment is unavailable for verification; no Actions run, deployed SHA or Pages result is claimed.
- README setup commands describe the intended implementation path; a complete fresh-checkout execution remains unverified.

## Pending release checks

- [ ] Resolve exact dependencies and commit a complete generated lockfile, then verify a clean Node 22 installation.
- [ ] Build/typecheck the complete API and run all database, n8n, recovery and authenticated live-browser suites on the actual isolated stack with zero unexpected skips.
- [ ] Publish the remaining tracked issues and reviewable implementation branches/PRs; close only criteria supported by evidence.
- [ ] Run the authored CI workflow successfully before merging the release to main.
- [ ] Deploy the verified immutable Pages artifact and record the exact commit, Actions run and deployment URL.
- [ ] Run desktop/mobile browser checks against the actual published URL, including actions/reset, asset errors and provider-network isolation.
