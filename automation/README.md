# Northstar automation

This is a fictional single-reviewer support boilerplate. The default stack uses a **controlled provider fixture**, deterministic keyword embeddings and a **Mailpit test sink**. Connecting React to the API does not make OpenAI or Gmail live. Fixture token values are simulated and are omitted from ticket usage; elapsed duration is measured.

The five default JSON workflows and the optional Gmail adapter are self-contained n8n graphs, generated with `node automation/scripts/generate-workflows.mjs`. n8n 2.44.6 runs its own supported Node runtime inside its official container; the application scripts use Node 22. Application state and vectors live in PostgreSQL/pgvector. n8n uses a separate persistent SQLite volume for workflow definitions, encrypted credentials and execution history. Read [the internal API contract](INTERNAL_API.md) for payloads and state guards.

After copying the root `.env.example` to ignored `.env` and setting distinct local secrets:

```sh
docker compose up -d --build --wait
docker compose exec -T n8n node /opt/automation/scripts/import-workflows.mjs
docker compose restart n8n
node automation/scripts/invoke-workflow.mjs ingest
```

Visit n8n at http://localhost:5678 and complete its local owner setup. Runtime import writes a short-lived credentials file with restricted permissions, imports only the five named workflow IDs and local sink credentials, then removes it. Importing these stable IDs overwrites those same workflows; use a separate n8n instance for this boilerplate. Publishing is per-ID and requires restarting n8n before production webhooks register. No exported JSON includes real secrets.

`northstar-intake` persists a webhook ticket. `northstar-process` claims a durable job and performs classification → query embedding → pgvector retrieval → grounded draft → review save. It never approves. Unknown topics ask for clarification; billing and sensitive account actions require a specialist. Both the graph and API reject source IDs that were not retrieved for the same job lease. Reviewer edits and approvals bind the exact version; `northstar-dispatch` sends only the claimed approved snapshot. Any uncertain SMTP result requires reconciliation without automatic resend. `northstar-recover` recovers expired processing leases and flags uncertain delivery claims.

Use `node automation/scripts/invoke-workflow.mjs <name> [request.json]` to call an authenticated webhook without putting a token in command-line arguments. It waits up to 30 seconds for n8n readiness after a restart. The intake JSON accepts only `externalId,subject,body,customerName,customerEmail`; labels from `fixtures/tickets/labeled.json` must be removed. The process body may be `{ "ticketId": "..." }`; other hooks accept `{}`. The process and dispatch schedules also poll every minute, recovery every five minutes. `AUTO_POLL_ENABLED=false` disables scheduled claims while keeping authenticated manual hooks available; the disposable integration runner uses this to avoid background races. All host ports bind to loopback. Keep n8n accessible only to a trusted operator because its configured expressions can read environment variables.

Run controlled checks:

```sh
node --test automation/tests/fixture.test.mjs
node automation/scripts/run-integration.mjs
```

The integration entrypoint requires a running Linux Docker engine and free ports 3000, 4010, 5432, 5678 and 8025. It builds an isolated PID-named stack with fake secrets, imports/publishes/restarts actual n8n, ingests the corpus, executes real webhooks, queries persisted API state, checks fixture counts and Mailpit, runs independent `tests/acceptance/*.test.mjs` when present, and removes only its disposable project volumes. It sets a 1500 ms provider timeout for the controlled 3500 ms timeout fault. Logs include workflow execution IDs. A failing Docker prerequisite is a failed verification, not a passing integration test.

The fixture service exposes local-only controls: POST `/__control/reset`, POST `/__control {externalId,scenario}`, GET `/__control/stats`. Scenarios include normal, no-sources, refusal, invalid-json, null-json, nonarray-output, bad-source, 429, 500, timeout and embedding-error. Setting `{scenario:"smtp-ambiguous-once"}` makes its fixed-upstream SMTP proxy hide one Mailpit acceptance acknowledgement, proving why a message may exist in the sink while dispatch requires reconciliation. This proxy is selected only in the isolated integration runner; ordinary local delivery connects directly to Mailpit.

For opt-in real OpenAI drafting, set `AI_PROVIDER_MODE=openai`, `OPENAI_BASE_URL=https://api.openai.com/v1`, your server-side key and supported model names in ignored `.env`, then recreate n8n and API. Re-ingest the corpus whenever the embedding provider/model changes: fixture and real vectors cannot be mixed. The graph uses strict Responses JSON schemas, 600/1200 maximum output tokens, bounded input, timeouts and no node retries. Up to three processing attempts mean up to nine provider calls per ticket, plus ingestion; this is not a daily currency cap. Inspect account usage and configure provider budget controls separately. `RUN_LIVE_OPENAI=1` plus `node automation/scripts/live-evaluation.mjs --limit=3` runs a bounded fictional evaluation and prints observed usage when returned. It never approves or dispatches. No live quality result is implied by fixture tests.

Slack is optional: set `SLACK_ENABLED=true` and a trusted `SLACK_WEBHOOK_URL`, plus `REVIEW_UI_URL` pointing to the reviewer app; recreate n8n. Notifications contain only a reviewer link and run after the draft is saved. Slack delivery failure leaves the review record intact; inspect n8n execution output. No Slack request occurs by default. The target URL never comes from ticket text.

The actual optional Gmail intake adapter is `automation/optional/northstarGmailIntake.json`. It is inactive and excluded from the default importer. Create a dedicated support mailbox, label incoming support mail `NorthstarSupport`, and create n8n's Gmail OAuth2 credential using your Google OAuth app. Its credential must permit reading messages and modifying read state; no Gmail send step exists in this intake adapter. Import the JSON through the n8n editor, select that credential in both Gmail nodes, review the polling query and publish explicitly. Keep `GMAIL_MAILBOX_KEY` stable for that mailbox; use a distinct key for a different mailbox.

The adapter polls one unread labeled message smaller than 250 KB, requests the complete plain body with attachment downloads disabled, normalizes its sender/subject/text, and uses `gmail:<mailboxKey>:<immutable Gmail id>` as externalId. RFC Message-ID, thread ID, Reply-To and instructions inside the body cannot change that ID or recipient. It marks mail read only after the API confirms durable intake, including duplicate success. Invalid/multiple senders, unavailable plain text or oversized messages stop before persistence and require operator attention. Gmail polling is not an exactly-once transport: inspect failed n8n executions and replay after fixing the cause; the API's unique externalId makes replay idempotent. The normalizer has realistic parsed-message and multipart Gmail API fixtures and unit checks. Gmail OAuth, the polling trigger, and read-state mutation have **not been live tested**.

Optional outgoing Gmail can use a separately configured authenticated Gmail SMTP credential in a workflow copy. Keep the approved outbox snapshot and claim token, disable node retries, and record the actual SMTP acceptance message ID. This is SMTP sending, not a tested Gmail API integration. Keep review approval and uncertain-delivery handling unchanged. Add only explicitly authorized recipient domains to `DELIVERY_ALLOWED_DOMAINS`, set `DELIVERY_MODE=gmail`, and perform your own configured-provider verification. The bootstrap importer deliberately accepts only local Mailpit hosts and cannot silently switch to a real mail server.

Authored code is MIT. n8n is distributed under its own [Sustainable Use License](https://docs.n8n.io/sustainable-use-license/); this repository does not relicense n8n. Official references: [Responses in n8n](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai), [n8n server CLI](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
