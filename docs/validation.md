# Validation and release evidence

The selected main revision has completed the real CI suites below. **Artifact export, deployment and published-demo verification are still pending.** Controlled OpenAI responses and Mailpit were used; no live OpenAI, Gmail or Slack result is claimed.

## Observed CI results

Source: [`0c4fdd19af853f67176f3beceaf1b79b71dc9275`](https://github.com/mithundas79/support-flow/commit/0c4fdd19af853f67176f3beceaf1b79b71dc9275), main-push [run 39957927244](https://github.com/mithundas79/support-flow/actions/runs/39957927244), attempt 1. The complete run is green. These are observed counts, with **zero failed or skipped test cases**.

| Gate | Command or entry point | Observed result | CI receipt |
| --- | --- | --- | --- |
| Clean installation | Declared npm 11.21.1, then `npm ci` | Passed on Node 22 | [Quality job][quality-ci] |
| Dependency audits | Full `npm audit --json`; production `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities in both reports | [Quality job][quality-ci] |
| Build and typecheck | `npm run build`; `npm run typecheck` | Passed, including the API | [Quality job][quality-ci] |
| Workspace unit tests | `npm test` | 22 passed: contracts 2, core 2, API 4, web 14 | [Quality job][quality-ci] |
| Native automation tests | `npm run test:automation` | 10 passed | [Quality job][quality-ci] |
| Published-byte verifier tests | `node --test scripts/verify-published-demo.test.mjs` | 9 local HTTP fixture tests passed | [Quality job][quality-ci] |
| Sample bundle inspection | `npm run check:public` | Built asset scan passed | [Quality job][quality-ci] |
| App browser tests | `npm run test:web:e2e` | 18 passed, desktop and mobile | [Quality job][quality-ci] |
| Independent sample browser tests | `npm run test:e2e` | 14 passed, seven per viewport | [Quality job][quality-ci] |
| Real PostgreSQL/API integration | API integration suite inside the stack runner | 9 passed | [Integration job][integration-ci] |
| Actual n8n workflow execution | `automation/tests/stack.test.mjs` inside the stack runner | 16 passed | [Integration job][integration-ci] |
| Independent whole-flow acceptance | `tests/acceptance/whole-flow.test.mjs` inside the stack runner | 19 passed | [Integration job][integration-ci] |
| Authenticated stack UI | `tests/e2e/independent-live.spec.ts` inside the stack runner | 2 passed, desktop and mobile, with Mailpit delivery | [Integration job][integration-ci] |
| Verified-artifact stage | Preserve sample only after quality and integration succeed | Passed for this main revision | [Artifact job][artifact-ci] |

Runtime: **Node 22.23.3**, **npm 11.21.1**, **Playwright 1.56.1**, and its downloaded Linux **Chromium 141.0.7390.37 / build 1194**. The local browser executable override was empty. Source dependencies include Vite 6.4.4 and Vitest 4.1.12. Services are pinned in `docker-compose.yml`; the actual n8n container imported, published and executed the workflow graphs.

The acceptance suite includes concurrent duplicate intake and approval, reviewer/internal authentication, CSRF/origin rejection, malformed inputs and provider envelopes, refusal/rate-limit/timeout handling, unsupported citations, specialist gating, restart recovery and ambiguous SMTP acknowledgment. Delivery checks compare the **complete approved revision**, allowing only demonstrated SMTP CRLF and final line framing. Repeated recovery/dispatch must not create a second Mailpit message after uncertain acceptance.

The 30 fictional tickets matched their authored category, priority and stored disposition expectations in one corpus acceptance test. This is included in the 19 acceptance tests; it is **not 30 additional tests or measured live-model accuracy**. The corresponding knowledge base contains ten fictional articles.

## Final release provenance

The main artifact is selected below. Export and publication must preserve these exact bytes; public completion requires its own HTTP and browser receipts. No placeholder manifest has been created.

| Receipt | Current status |
| --- | --- |
| Main source commit | `0c4fdd19af853f67176f3beceaf1b79b71dc9275` |
| Successful main-push CI run | [39957927244](https://github.com/mithundas79/support-flow/actions/runs/39957927244), attempt 1 |
| Selected artifact ID | `12503712622` |
| Exact artifact name | `verified-sample-demo-0c4fdd19af853f67176f3beceaf1b79b71dc9275` |
| Artifact archive digest | `sha256:6ae705956c5f10caf0e2d68823444e1bd85a92fd4c4d30ea7ea5c9941ecfa76c` |
| Artifact archive size | 83,152 bytes |
| Artifact-only export branch and commit | Pending validation/export of that exact main artifact |
| `docs/demo-release.json` | Pending the actual artifact receipt; must enumerate every regular artifact file and SHA-256 |
| Publication repository commit and deployed path | Pending publication |
| Published HTML/JS/CSS byte comparison | Pending actual HTTP verification against the manifest |
| Published desktop/mobile browser run | Pending exactly 14 passing checks, zero failures/skips |

The final manifest will bind `baseUrl`, `sourceCommit`, `sourceRunId`, `sourceArtifactId`, the GitHub artifact digest and per-file hashes. The byte verifier compares buffers without text normalization and rejects unexpected paths, redirects, missing files and hash differences. It preserves the claimed provenance fields; the exporter separately validates their GitHub run/artifact relationship and the complete ZIP file enumeration.

## Observed n8n trace

The [main integration log][integration-ci] records `N8N_TRACE` for workflow `northstarProcess`, execution **3**, ticket `02bb3636-b4e4-4f4b-9108-a3ed9d72b19f`. Three controlled-provider requests returned HTTP 200: classification (600 maximum output tokens), a 1536-dimensional query embedding, and drafting (1200 maximum output tokens). Provider mode was `fixture`; the OpenAI endpoint flag was false. Source-presence and knowledge-base-subset assertions passed; individual source IDs were not printed.

The same log records these explicit `N8N_FAILURE_TRACE` executions:

| Execution | Controlled scenario | Calls in this attempt | Persisted ticket status |
| --- | --- | --- | --- |
| 8 | No sources | 2 | `needs_attention` |
| 10 | Refusal | 1 | `needs_attention` |
| 12 | Invalid JSON | 1 | `needs_attention` |
| 14 | JSON null | 1 | `needs_attention` |
| 16 | Non-array output | 1 | `needs_attention` |
| 18 | Unsupported source | 3 | `needs_attention` |
| 20 | Draft refusal | 3 | `needs_attention` |
| 22 | Incomplete draft | 3 | `needs_attention` |
| 24 | Invalid draft JSON | 3 | `needs_attention` |
| 26 | HTTP 429 | 1 | `received` |
| 28 | HTTP 500 | 1 | `received` |
| 30 | Timeout | 1 | `received` |
| 32 | Embedding error | 2 | `received` |

`received` means that this retryable attempt was persisted and requeued. The independent acceptance suite separately drives the bounded attempt budget to human attention and checks the provider-call ceiling. These are actual engine executions with controlled providers, not real-model quality results.

## What the evidence establishes

| Mode | Observed scope | Provider boundary |
| --- | --- | --- |
| Public-sample build in CI | Prepared fictional records, edits/decisions/reset/reload, source panels, storage recovery, keyboard/mobile behavior, asset and request checks | Browser-only; no AI or email sending |
| Authenticated fixture stack in CI | Actual React/API/PostgreSQL/n8n execution, durable jobs, source validation, immutable approval and Mailpit SMTP delivery | Only OpenAI/provider behavior is controlled; API, database and n8n are real |
| Real OpenAI, Gmail and Slack | Not run | No live quality, OAuth, inbox delivery, Slack operation or provider cost claim |

Mailpit acceptance proves that the configured local sink received the approved content. It does not prove customer inbox delivery or exactly-once email delivery. The fixture corpus does not establish representative production accuracy, scale or production readiness.

## Reproduce the integration trace

Follow the README's Node 22/npm 11.21.1 installation instructions, install the declared Playwright Chromium, then run:

```sh
node automation/scripts/run-integration.mjs
```

The runner starts a disposable PID-named Docker project with fake credentials, imports/publishes actual n8n workflows, ingests fictional knowledge, runs the API/workflow/acceptance suites, and starts the authenticated UI for desktop/mobile checks. It supplies the required test origin, fixture timeout and project-isolation flags, then removes only its disposable resources. Test output includes workflow execution references; CI preserves its stack log and browser reports as evidence artifacts.

The complete trace is: authenticated intake, persisted job, real n8n retrieval/draft save, reviewer revision and version-bound approval, immutable dispatch, then inspection of the received Mailpit content and audit history. Negative cases and recovery run against the same real services.

The [README screenshot](screenshots/review-workspace.png) is an actual application capture of fictional local sample data. It is not represented as a screenshot of an as-yet-unverified public deployment.

[quality-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244/job/120428315357
[integration-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244/job/120428314796
[artifact-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244/job/120429918021
