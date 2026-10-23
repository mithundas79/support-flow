# Workflow contract

Every request below uses `Authorization: Bearer WORKFLOW_TOKEN`. These credentials are distinct from the reviewer session. The n8n incoming webhooks use a header credential imported at runtime; exports contain credential IDs only. Internal API base: `http://api:3000/internal/v1`.

| Method and path | Request | Response / guard |
| --- | --- | --- |
| POST `/tickets/intake` | `externalId, subject, body, customerName, customerEmail` | `{ticket,created}`; unique external ID; duplicate intake does not create another job |
| POST `/jobs/claim` | `workerId, ticketId?` | `{job:null}` or `{job:{id,ticketId,leaseToken,attempt,ticket}}`; 600 second lease, at most 3 attempts |
| GET `/knowledge/documents` | none | `{documents:[{id,title,content,url?,embedded}]}`; canonical fictional authored corpus |
| POST `/knowledge/upsert` | `{documents:[{id,title,content,url?,embedding}]}` | max 32 documents, 1536 finite dimensions; no remote URL fetching |
| POST `/knowledge/search` | `jobId, leaseToken, embedding, limit:3, minScore:0.32` | `{sources:[{id,title,excerpt,url?}]}` from pgvector; retrieved snapshots bound to this job lease |
| POST `/tickets/:id/draft` | `jobId,leaseToken,classification:{category,priority,summary},draft,sourceIds,disposition,runId` | `{ticket}`; cite only retrieved IDs; empty sources, billing, sensitive account actions or disposition other than review require attention |
| POST `/tickets/:id/failure` | `jobId,leaseToken,code,message,retryable,runId` | records failure; stale lease 409; retry at most 3 attempts |
| POST `/outbox/claim` | `workerId` | `{item:null}` or `{item:{id,ticketId,draftVersion,to,subject,body,claimToken,messageId}}`; exact approved snapshot |
| POST `/outbox/:id/sent` | `claimToken,providerMessageId` | receipt after SMTP acceptance; token bound to the one claimed dispatch |
| POST `/outbox/:id/failure` | `claimToken,code,message,ambiguous` | ambiguous delivery requires manual reconciliation; never automatically reclaimed |
| POST `/maintenance/recover` | `{}` | `{jobsRequeued,jobsFailed,deliveriesUncertain}`; recover expired processing without claiming work |

Errors are `{error:{code,message}}`. Reviewer login is `POST /api/v1/auth/login {token:REVIEWER_TOKEN}` with the configured Origin. Keep its session cookie and returned csrfToken; mutations require that cookie, Origin and `X-CSRF-Token`. Edits and approvals send `expectedVersion`. No provider output can call reviewer approval endpoints.

Authenticated n8n webhook paths are `/webhook/northstar-intake`, `northstar-process`, `northstar-ingest`, `northstar-dispatch`, and `northstar-recover`. Intake acknowledges durable persistence. Process accepts optional `{ticketId}` and returns only after the claimed job is persisted; schedules also poll every minute. Ingestion embeds all authored corpus documents. Recovery runs every five minutes.

The graph makes at most three provider calls per processing attempt: classification, query embedding, grounded draft. Sensitive requests use one call; missing sources use two. Each node has no automatic retries. The 180 second execution timeout remains below the 600 second job lease. Three durable attempts bound processing to nine provider calls, excluding corpus ingestion. Token limits are 600 classification and 1200 draft output tokens; these limits are not a currency budget. Input is truncated to 12,000 characters. Embeddings use 1536 dimensions.

SMTP acceptance means the configured sink accepted the message. It does not prove customer inbox delivery. n8n's SMTP node supplies its own Message-ID, returned as providerMessageId. The outbox prevents a second automatic dispatch; it does not claim exactly-once delivery across a network failure. A crash after acceptance or any send error requires manual sink/provider reconciliation before a deliberate new delivery.
