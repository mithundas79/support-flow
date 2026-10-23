# Independent acceptance matrix

This matrix records observed execution, not merely authored tests. **Q** is the [quality job][quality-ci] and **I** is the [real-stack integration job][integration-ci] of green main-push run [39957927244][source-ci], source `0c4fdd19af853f67176f3beceaf1b79b71dc9275`. **P** is the [actual published verification][public-ci]. Exact artifact/export/deployment receipts are recorded in [validation.md](validation.md).

Controlled fixtures replace OpenAI responses and selected SMTP behavior. The API, PostgreSQL and n8n engine run as real services. The authenticated browser uses that actual stack.

| ID | Criterion | Observed evidence |
| --- | --- | --- |
| F01 | Clean install, supported runtime, pinned dependencies and contracts | Q: Node 22/npm 11.21.1 `npm ci`, build/typecheck and 22 workspace tests passed |
| F02 | Pinned services, readiness and persistent state | I: actual Compose stack, PostgreSQL/n8n readiness and restart checks passed |
| F03 | Fake configuration and browser/provider isolation | Q: bundle scan and sample browser request/error checks passed |
| A01 | Reviewer and workflow authentication are independent | I: missing/invalid credentials, malformed requests and cookie/internal separation passed |
| A02 | CSRF and exact-origin checks protect mutations | I: valid sessions with missing CSRF or foreign Origin were rejected |
| A03 | Concurrent duplicate intake creates one ticket | I: simultaneous actual n8n intake requests persisted one external ID |
| A04 | Versions bind edits, decisions and outbox creation | I: stale/rejected/repeated and simultaneous approval checks passed |
| A05 | Delivery contains the immutable approved revision | I: complete Mailpit body matched the approved revision after SMTP newline framing |
| A06 | Pending jobs survive API restart | I: disposable API restart retained the job; actual n8n processing completed |
| A07 | Ambiguous delivery never blindly resends | I: Mailpit accepted once, acknowledgment was hidden, repeated recovery/dispatch kept one message |
| N01 | n8n executes retrieval and grounded drafting | I: actual imported/published workflows, fixture request counts and persisted sources/drafts passed |
| N02 | Missing sources block routine approval | I: no-source case required attention; approval failed explicitly |
| N03 | Sensitive requests require specialist handling | I: sensitive cases and the 30-ticket category/priority/stored-disposition corpus passed |
| N04 | Invented citations cannot publish a routine draft | I: unsupported source IDs were rejected |
| N05 | Refusal, malformed data, errors and timeouts stay bounded | I: provider scenarios, persisted outcomes and request ceilings passed |
| N06 | External provider credentials are optional and isolated | I: fixture-only provider and Mailpit configuration ran without real OpenAI/Gmail/Slack |
| W01 | Sample is visibly synthetic and cannot send | Q: disclosures, actions, reload/reset and network observations passed |
| W02 | Review workspace supports revisions and decisions | Q: 18 app and 14 independent desktop/mobile checks passed |
| W03 | Keyboard, focus and responsive access work | Q: dialog/key flows, visible focus and viewport-fit checks passed |
| W04 | Invalid sample storage recovers safely | Q: corrupted/blocked storage and reset cases passed |
| W05 | Authenticated UI reaches the actual backend | I: two browser cases completed real fixture intake, versioned approval and Mailpit delivery |
| R01 | Published Pages base path and assets work | P: four exact file hashes/byte counts and 14 desktop/mobile cases passed with no failed requests or JavaScript errors |
| R02 | Release identifies tested source and deployed bytes | Main artifact `12503712622`, orphan export, profile commit, Pages deployment and P are linked by the manifest and recorded release receipts |
| D01 | Demo visitors and installers have clear paths | README links the verified live demo and separate boilerplate setup, with an actual screenshot and supported npm 11.21.1 commands |
| D02 | Evidence is reproducible and accurately scoped | Q/I/P counts, commands, workflow traces and exact source/artifact/deployment receipts recorded; live-provider limits explicit |

## Evaluation limits

The 30-ticket fictional corpus checks authored behavior, including the database distinction between clarification and escalation. It is not a representative production dataset or a live-model accuracy measurement. Passing controlled responses establish the exercised workflow behavior, not real OpenAI quality, Gmail/Slack operation, production scale or exactly-once transport.

Ambiguous SMTP outcomes remain blocked for human reconciliation. Evidence and screenshots contain fictional Northstar records only; no customer data, account secrets or private operational telemetry belongs in this repository.

[source-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244
[quality-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244/job/120428315357
[integration-ci]: https://github.com/mithundas79/support-flow/actions/runs/39957927244/job/120428314796
[public-ci]: https://github.com/mithundas79/support-flow/actions/runs/39959667796/job/120434182139
