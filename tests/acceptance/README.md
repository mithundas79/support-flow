# Real-stack acceptance tests

This suite invokes the actual n8n webhooks, persists through the API and PostgreSQL, and inspects Mailpit delivery. The controlled fixture replaces OpenAI and adds an SMTP ambiguity scenario. It does not stub the API, database, workflow engine, or reviewer authentication.

Run against a **disposable fixture stack** after importing and activating the workflows. The coordinating stack instructions live in the repository README. Set the same `REVIEWER_TOKEN`, `WORKFLOW_TOKEN`, and `APP_ORIGIN` as the API; the suite reads an ignored local `.env` if present, with process environment taking precedence.

```sh
npm run test:acceptance
```

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `ACCEPTANCE_API_URL` | `http://127.0.0.1:3000` | Actual API |
| `ACCEPTANCE_N8N_URL` | `http://127.0.0.1:5678` | Activated n8n production webhooks |
| `ACCEPTANCE_FIXTURE_URL` | `http://127.0.0.1:4010` | Controlled provider service |
| `ACCEPTANCE_MAILPIT_URL` | `http://127.0.0.1:8025` | Mailpit inspection API |
| `ACCEPTANCE_ALLOW_RESTART` | unset | `1` allows the suite to restart the disposable API container |
| `ACCEPTANCE_COMPOSE_FILES` | `docker-compose.yml` | Comma-separated Compose files for the restart check |
| `ACCEPTANCE_COMPOSE_PROJECT` | `COMPOSE_PROJECT_NAME`, otherwise Compose default | Isolated disposable project to restart |

Each run creates unique fictional external IDs and addresses under `example.test`. Tests run sequentially because the SMTP ambiguity fixture is a one-shot global switch. No real Gmail or Slack connection is required. Missing services or credentials fail the suite; the restart test is explicitly skipped unless authorized by the disposable-stack flag. Report the skip rather than counting it as restart evidence.

The corpus test also uses the local Docker CLI for one read-only PostgreSQL query scoped to the 30 UUIDs created by that run. This checks the stored distinction between clarification and escalation, which share a public attention status. No unrelated tickets are queried.

The suite resets fixture request counters, but preserves database records and existing Mailpit messages. Use the documented stack reset only when you intend to delete disposable local data.
