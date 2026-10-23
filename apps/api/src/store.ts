import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { CreateTicketInput, Source, Ticket } from '@support-flow/contracts';
import { DomainError, requireReview, requiresSpecialist, recipientAllowed, type ProcessingUsage } from '@support-flow/core';
import { tx, type Pool } from './db.js';
import type { Config } from './config.js';
type Row = QueryResultRow;
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (v: Date | string) => new Date(v).toISOString();
export class Store {
  constructor(public readonly pool: Pool, private readonly config: Config) {}
  async event(c: PoolClient, id: string, type: string, message: string) {
    await c.query('INSERT INTO ticket_events(id,ticket_id,type,message) VALUES($1,$2,$3,$4)', [randomUUID(), id, type, message]);
  }
  async ticket(id: string, c: Pool | PoolClient = this.pool): Promise<Ticket> {
    const result = await c.query('SELECT * FROM tickets WHERE id=$1', [id]);
    if (!result.rows[0]) throw new DomainError('NOT_FOUND', 'Ticket not found.', 404);
    return this.dto(result.rows[0], c);
  }
  private async dto(r: Row, c: Pool | PoolClient): Promise<Ticket> {
    const events = await c.query('SELECT id,type,message,created_at FROM ticket_events WHERE ticket_id=$1 ORDER BY created_at,id', [r.id]);
    return { id: r.id, externalId: r.external_id, subject: r.subject, body: r.body, customerName: r.customer_name, customerEmail: r.customer_email,
      category: r.category, priority: r.priority, status: r.status, summary: r.summary, draft: r.draft, draftVersion: r.draft_version, sources: r.sources,
      events: events.rows.map(e => ({ id: e.id, type: e.type, message: e.message, createdAt: iso(e.created_at) })), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) };
  }
  async list(): Promise<Ticket[]> {
    const ids = await this.pool.query('SELECT id FROM tickets ORDER BY created_at DESC LIMIT 100');
    return Promise.all(ids.rows.map(r => this.ticket(r.id)));
  }
  async create(input: CreateTicketInput): Promise<{ ticket: Ticket; created: boolean }> {
    return tx(this.pool, async c => {
      const id = randomUUID();
      const inserted = await c.query('INSERT INTO tickets(id,external_id,subject,body,customer_name,customer_email) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(external_id) DO NOTHING RETURNING id', [id, input.externalId, input.subject, input.body, input.customerName, input.customerEmail]);
      if (!inserted.rowCount) {
        const existing = (await c.query('SELECT * FROM tickets WHERE external_id=$1', [input.externalId])).rows[0];
        if (existing.subject !== input.subject || existing.body !== input.body || existing.customer_name !== input.customerName || existing.customer_email !== input.customerEmail) throw new DomainError('IDEMPOTENCY_CONFLICT', 'externalId was already used for different ticket content.');
        return { ticket: await this.dto(existing, c), created: false };
      }
      await c.query('INSERT INTO processing_jobs(id,ticket_id) VALUES($1,$2)', [randomUUID(), id]);
      await this.event(c, id, 'received', 'Ticket accepted. Waiting for the n8n processing workflow.');
      return { ticket: await this.ticket(id, c), created: true };
    });
  }
  async edit(id: string, draft: string, expectedVersion: number) {
    return tx(this.pool, async c => {
      const r = await this.lockTicket(c, id); requireReview(r.status, r.draft_version, expectedVersion);
      await c.query('UPDATE tickets SET draft=$2,draft_version=draft_version+1,updated_at=now() WHERE id=$1', [id, draft]);
      await this.event(c, id, 'draft_edited', `Reviewer edited draft version ${expectedVersion + 1}; prior review authority is invalidated.`);
      return this.ticket(id, c);
    });
  }
  async approve(id: string, expectedVersion: number) {
    return tx(this.pool, async c => {
      const r = await this.lockTicket(c, id); requireReview(r.status, r.draft_version, expectedVersion);
      if (r.status !== 'awaiting_review' || r.disposition !== 'review' || !r.draft || !r.sources.length || requiresSpecialist(r.subject, r.body)) throw new DomainError('SPECIALIST_REQUIRED', 'This ticket needs evidence or specialist handling and cannot enter routine delivery.', 422);
      if (!recipientAllowed(r.customer_email, this.config.allowedDomains)) throw new DomainError('RECIPIENT_NOT_ALLOWED', 'Recipient domain is outside the configured delivery allowlist.', 422);
      const dispatchId = randomUUID();
      await c.query('INSERT INTO delivery_outbox(id,ticket_id,draft_version,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6)', [dispatchId, id, expectedVersion, r.customer_email, `Re: ${r.subject}`, r.draft]);
      await c.query("UPDATE tickets SET status='approved',updated_at=now() WHERE id=$1", [id]);
      await this.event(c, id, 'approved', `Reviewer approved draft version ${expectedVersion}; dispatch ${dispatchId} queued atomically.`);
      return this.ticket(id, c);
    });
  }
  async reject(id: string, expectedVersion: number, reason: string) {
    return tx(this.pool, async c => {
      const r = await this.lockTicket(c, id); requireReview(r.status, r.draft_version, expectedVersion);
      await c.query("UPDATE tickets SET status='rejected',updated_at=now() WHERE id=$1", [id]);
      await this.event(c, id, 'rejected', `Reviewer rejected draft version ${expectedVersion}: ${reason}`);
      return this.ticket(id, c);
    });
  }
  private async lockTicket(c: PoolClient, id: string): Promise<Row> {
    const r = (await c.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!r) throw new DomainError('NOT_FOUND', 'Ticket not found.', 404); return r;
  }
  async recover() {
    return tx(this.pool, async c => {
      let jobsRequeued = 0, jobsFailed = 0, deliveriesUncertain = 0;
      const expired = await c.query("SELECT * FROM processing_jobs WHERE state='leased' AND lease_expires_at<=now() FOR UPDATE SKIP LOCKED");
      for (const j of expired.rows) {
        const exhausted = j.attempts >= 3;
        await c.query('UPDATE processing_jobs SET state=$2,lease_token=NULL,lease_expires_at=NULL,retrieved_sources=\'[]\' WHERE id=$1', [j.id, exhausted ? 'failed' : 'pending']);
        await c.query('UPDATE tickets SET status=$2,updated_at=now() WHERE id=$1', [j.ticket_id, exhausted ? 'needs_attention' : 'received']);
        await this.event(c, j.ticket_id, exhausted ? 'processing_exhausted' : 'processing_requeued', exhausted ? 'Processing attempt budget exhausted; human follow-up required.' : 'Expired processing lease recovered for a bounded retry.');
        if (exhausted) jobsFailed++; else jobsRequeued++;
      }
      const deliveries = await c.query("SELECT * FROM delivery_outbox WHERE state='claimed' AND claim_expires_at<=now() FOR UPDATE SKIP LOCKED");
      for (const d of deliveries.rows) {
        await c.query("UPDATE delivery_outbox SET state='uncertain',failure_code='CLAIM_EXPIRED',updated_at=now() WHERE id=$1", [d.id]);
        await c.query("UPDATE tickets SET status='needs_attention',updated_at=now() WHERE id=$1", [d.ticket_id]);
        await this.event(c, d.ticket_id, 'delivery_uncertain', 'Delivery claim expired without a confirmed outcome. Automatic resend is blocked; reconcile with the mail provider.'); deliveriesUncertain++;
      }
      await c.query('DELETE FROM reviewer_sessions WHERE expires_at<=now()');
      return { jobsRequeued, jobsFailed, deliveriesUncertain };
    });
  }
  async claimJob(workerId: string, ticketId?: string) {
    await this.recover();
    return tx(this.pool, async c => {
      const j = (await c.query("SELECT * FROM processing_jobs WHERE state='pending' AND attempts<3 AND ($1::uuid IS NULL OR ticket_id=$1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1", [ticketId ?? null])).rows[0];
      if (!j) return null;
      const leaseToken = randomUUID();
      await c.query("UPDATE processing_jobs SET state='leased',attempts=attempts+1,lease_token=$2,lease_expires_at=now()+($3::int*interval '1 second'),worker_id=$4,retrieved_sources='[]' WHERE id=$1", [j.id, leaseToken, this.config.leaseSeconds, workerId]);
      await c.query("UPDATE tickets SET status='processing',updated_at=now() WHERE id=$1", [j.ticket_id]);
      await this.event(c, j.ticket_id, 'processing', `n8n claimed processing attempt ${j.attempts + 1}.`);
      return { id: j.id, ticketId: j.ticket_id, leaseToken, attempt: j.attempts + 1, ticket: await this.ticket(j.ticket_id, c) };
    });
  }
  private async lease(c: PoolClient, jobId: string, leaseToken: string, ticketId?: string, hash?: string): Promise<Row> {
    const j = (await c.query('SELECT * FROM processing_jobs WHERE id=$1 FOR UPDATE', [jobId])).rows[0];
    if (!j || j.lease_token !== leaseToken || (ticketId && j.ticket_id !== ticketId)) throw new DomainError('INVALID_LEASE', 'Processing lease does not match this ticket.');
    if (hash && j.state === 'completed' && j.result_hash === hash) return j;
    if (j.state !== 'leased' || new Date(j.lease_expires_at).getTime() <= Date.now()) throw new DomainError('STALE_LEASE', 'Processing lease is expired or already consumed.');
    return j;
  }
  async search(input: { jobId: string; leaseToken: string; embedding: number[]; limit: number; minScore: number }): Promise<Source[]> {
    return tx(this.pool, async c => {
      await this.lease(c, input.jobId, input.leaseToken);
      const results = await c.query('SELECT id,title,content,url,1-(embedding <=> $1::vector) AS score FROM knowledge_documents WHERE embedding IS NOT NULL AND 1-(embedding <=> $1::vector)>=$2 ORDER BY embedding <=> $1::vector,id LIMIT $3', [JSON.stringify(input.embedding), input.minScore, input.limit]);
      const sources: Source[] = results.rows.map(d => ({ id: d.id, title: d.title, excerpt: d.content.slice(0, 2000), ...(d.url ? { url: d.url } : {}) }));
      await c.query('UPDATE processing_jobs SET retrieved_sources=$2::jsonb WHERE id=$1', [input.jobId, JSON.stringify(sources)]);
      return sources;
    });
  }
  async assessment(ticketId: string, input: { jobId: string; leaseToken: string; classification: { category: string; priority: string; summary: string }; draft: string; sourceIds: string[]; disposition: string; runId: string; usage?: ProcessingUsage }) {
    const hash = fingerprint(input);
    return tx(this.pool, async c => {
      const j = await this.lease(c, input.jobId, input.leaseToken, ticketId, hash);
      if (j.state === 'completed') return this.ticket(ticketId, c);
      const retrieved: Source[] = j.retrieved_sources;
      const ids = [...new Set(input.sourceIds)];
      if (ids.some(id => !retrieved.some(s => s.id === id))) throw new DomainError('UNSUPPORTED_SOURCE', 'Draft cites a source that was not retrieved for this processing lease.', 422);
      const sources = retrieved.filter(s => ids.includes(s.id));
      const r = await this.lockTicket(c, ticketId);
      const sensitive = requiresSpecialist(r.subject, r.body);
      const ready = input.disposition === 'review' && sources.length > 0 && !sensitive;
      const disposition = sensitive ? 'escalate' : input.disposition;
      await c.query('UPDATE tickets SET category=$2,priority=$3,summary=$4,draft=$5,draft_version=draft_version+1,sources=$6::jsonb,disposition=$7,status=$8,updated_at=now() WHERE id=$1', [ticketId, input.classification.category, input.classification.priority, input.classification.summary, input.draft, JSON.stringify(sources), disposition, ready ? 'awaiting_review' : 'needs_attention']);
      await c.query("UPDATE processing_jobs SET state='completed',result_hash=$2,usage=$3::jsonb WHERE id=$1", [input.jobId, hash, JSON.stringify(input.usage ?? {})]);
      await this.event(c, ticketId, ready ? 'draft_ready' : 'human_attention', ready ? `n8n run ${input.runId} prepared an evidence-linked draft for review.` : `n8n run ${input.runId} requires human follow-up: ${sensitive ? 'sensitive account or billing request' : sources.length === 0 ? 'no supporting retrieved evidence' : disposition}.`);
      if (input.usage && Object.keys(input.usage).length) await this.event(c, ticketId, 'processing_usage', `Reported processing telemetry: ${Object.entries(input.usage).map(([key, value]) => `${key}=${value}`).join(', ')}. Unreported values are unknown.`);
      return this.ticket(ticketId, c);
    });
  }
  async processingFailure(ticketId: string, input: { jobId: string; leaseToken: string; code: string; message: string; runId: string; retryable: boolean }) {
    return tx(this.pool, async c => {
      const j = await this.lease(c, input.jobId, input.leaseToken, ticketId);
      const retry = input.retryable && j.attempts < 3;
      await c.query('UPDATE processing_jobs SET state=$2,lease_token=NULL,lease_expires_at=NULL WHERE id=$1', [j.id, retry ? 'pending' : 'failed']);
      await c.query('UPDATE tickets SET status=$2,updated_at=now() WHERE id=$1', [ticketId, retry ? 'received' : 'needs_attention']);
      await this.event(c, ticketId, 'processing_failure', `n8n run ${input.runId}: ${input.code}: ${input.message}. ${retry ? 'Bounded retry queued.' : 'Human follow-up required.'}`);
      return this.ticket(ticketId, c);
    });
  }
  async documents() {
    const docs = await this.pool.query('SELECT id,title,content,url,(embedding IS NOT NULL) AS embedded FROM knowledge_documents ORDER BY id');
    return docs.rows.map(d => ({ id: d.id, title: d.title, content: d.content, ...(d.url ? { url: d.url } : {}), embedded: d.embedded }));
  }
  async upsert(documents: Array<{ id: string; title: string; content: string; url?: string; embedding: number[] }>) {
    await tx(this.pool, async c => { for (const d of documents) await c.query('INSERT INTO knowledge_documents(id,title,content,url,embedding) VALUES($1,$2,$3,$4,$5::vector) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,url=excluded.url,embedding=excluded.embedding,updated_at=now()', [d.id, d.title, d.content, d.url ?? null, JSON.stringify(d.embedding)]); });
    return { upserted: documents.length };
  }
  async claimDelivery(workerId: string) {
    await this.recover();
    return tx(this.pool, async c => {
      const d = (await c.query("SELECT * FROM delivery_outbox WHERE state='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
      if (!d) return null;
      const claimToken = randomUUID();
      await c.query("UPDATE delivery_outbox SET state='claimed',claim_token=$2,claim_expires_at=now()+($3::int*interval '1 second'),worker_id=$4,updated_at=now() WHERE id=$1", [d.id, claimToken, this.config.leaseSeconds, workerId]);
      await c.query("UPDATE tickets SET status='sending',updated_at=now() WHERE id=$1", [d.ticket_id]);
      await this.event(c, d.ticket_id, 'sending', `n8n claimed immutable dispatch ${d.id}. Retries after an uncertain send are blocked.`);
      return { id: d.id, ticketId: d.ticket_id, draftVersion: d.draft_version, to: d.recipient, subject: d.subject, body: d.body, claimToken, messageId: `<support-flow-${d.id}@northstar.example>` };
    });
  }
  async deliveryOutcome(id: string, input: { claimToken: string; providerMessageId?: string; ambiguous?: boolean; code?: string; message?: string }) {
    return tx(this.pool, async c => {
      const d = (await c.query('SELECT * FROM delivery_outbox WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!d || d.claim_token !== input.claimToken) throw new DomainError('INVALID_CLAIM', 'Delivery claim does not match.');
      if (d.state === 'sent' && input.providerMessageId === d.provider_message_id) return this.ticket(d.ticket_id, c);
      if (!['claimed', 'uncertain'].includes(d.state) || (d.state === 'uncertain' && !input.providerMessageId)) throw new DomainError('INVALID_STATE', 'Delivery outcome was already recorded.');
      const state = input.providerMessageId ? 'sent' : input.ambiguous ? 'uncertain' : 'failed';
      await c.query('UPDATE delivery_outbox SET state=$2,provider_message_id=$3,failure_code=$4,updated_at=now() WHERE id=$1', [id, state, input.providerMessageId ?? null, input.code ?? null]);
      await c.query('UPDATE tickets SET status=$2,updated_at=now() WHERE id=$1', [d.ticket_id, state === 'uncertain' ? 'needs_attention' : state]);
      await this.event(c, d.ticket_id, `delivery_${state}`, input.providerMessageId ? `Dispatch ${id} confirmed by provider as ${input.providerMessageId}.` : `Dispatch ${id}: ${input.code}: ${input.message}. ${state === 'uncertain' ? 'Automatic resend blocked; reconcile with provider.' : 'Delivery stopped; human follow-up required.'}`);
      return this.ticket(d.ticket_id, c);
    });
  }
}
