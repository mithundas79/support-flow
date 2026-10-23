# Independent acceptance matrix

These checks are owned separately from the application and workflow implementations. A checked-in test is a plan until an execution is recorded in [validation.md](validation.md). Controlled provider fixtures replace only OpenAI and SMTP delivery behavior; integration evidence requires the real API, PostgreSQL and n8n workflow engine.

| ID | Criterion | Independent evidence |
| --- | --- | --- |
| F01 | Fresh install, Node 22, pinned dependencies, shared contracts | Clean checkout install/build/typecheck/unit output; actual versions |
| F02 | Pinned services, readiness, persistent storage | Compose configuration and readiness probes |
| F03 | No browser secrets, fake example configuration | Bundle scan plus browser request allowlist |
| A01 | Reviewer and workflow auth are independent | Missing/invalid credentials, public cookie cannot call internal routes |
| A02 | CSRF and origin checks protect mutations | Valid session with missing CSRF or foreign Origin is rejected |
| A03 | Duplicate concurrent intake creates one ticket | Concurrent real n8n webhook requests; one persisted external ID |
| A04 | Optimistic versions bind review and dispatch | Stale edit/approval, repeated approval, rejected approval |
| A05 | Dispatch contains the approved immutable revision | Edit, approve, inspect received Mailpit message and audit timeline |
| A06 | Pending jobs survive restart | Stop/start API with pending job; n8n consumes persisted job afterward |
| A07 | Ambiguous delivery never blindly retries | SMTP proxy accepts once and hides acknowledgment; recover twice; one message |
| N01 | n8n executes retrieval and grounded drafting | Actual webhook, persisted sources/draft and fixture request counts |
| N02 | Unknown/no-source requests require attention | No-source fixture results in blocked approval |
| N03 | Sensitive requests require escalation | Fictional sensitive ticket produces attention disposition |
| N04 | Model output cannot invent citations | Unknown citation is rejected before draft approval |
| N05 | Refusal/malformed/error/timeout behavior is bounded | Controlled Responses outcomes, persisted failure and call ceilings |
| N06 | Provider credentials are optional and isolated | Fixture-only run uses no real OpenAI/Gmail/Slack connection |
| W01 | Sample is visibly synthetic and cannot send | Prominent disclosure; request capture; approve/reject/reset/reload |
| W02 | Review workspace supports edits and decisions | Desktop browser edit/approve/reject and state persistence |
| W03 | Responsive keyboard access works | Mobile viewport, labels, focus traversal and no horizontal overflow |
| W04 | Corrupt sample storage recovers predictably | Invalid persisted state then reload/reset |
| W05 | Authenticated UI reaches the actual backend | Live login, fixture intake, UI revision/approval, Mailpit delivery |
| R01 | Pages base path resolves assets and routes | Published /support-flow/ browser run with no 404/JS errors |
| R02 | Release links identify the tested revision | Deployed SHA, Actions URL and deployment URL recorded together |
| D01 | Demo visitors and installers have clear paths | README has separate try/run paths, actual screenshot and supported commands |
| D02 | Evidence is honest and reproducible | Exact commands, counts, fixture/live distinction and blockers |

## Evaluation limits

The fictional ticket corpus checks defined behavior, not representative production accuracy. A passing fixture run proves handling of those controlled responses and the exercised workflow graph. It does not establish OpenAI quality, Gmail delivery, Slack operation, real-world retrieval accuracy, production scale, or exactly-once email delivery. Ambiguous SMTP outcomes require a reviewer to reconcile the delivery sink before taking further action.

Run data must never contain customer messages, account secrets, personal operational telemetry, or unredacted credentials. Screenshots use fictional Northstar records only.
