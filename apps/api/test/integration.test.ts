import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';
import { createPool, migrate, type Pool } from '../src/db.js';
import type { Config } from '../src/config.js';

// This suite deliberately fails without REAL PostgreSQL + pgvector. No in-memory fallback.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point at PostgreSQL with pgvector for integration tests.');
const schema = `sf_test_${randomUUID().replaceAll('-', '')}`;
const database = new URL(process.env.DATABASE_URL);
database.searchParams.set('options', `-csearch_path=${schema},public`);
const config: Config = { databaseUrl: database.toString(), reviewerToken: 'reviewer-test-token-at-least-24', workflowToken: 'workflow-test-token-at-least-24', appOrigin: 'http://localhost:5173', secureCookie: false, allowedDomains: ['example.test'], leaseSeconds: 600, providerMode: 'fixture', deliveryMode: 'mailpit' };
const internalHeaders = { authorization: `Bearer ${config.workflowToken}` };
const vector = [1, ...Array.from({ length: 1535 }, () => 0)];
const input = (externalId = randomUUID()) => ({ externalId, subject: 'Webhook receives 401', body: 'Where should the integration authorization header go?', customerName: 'Avery Sample', customerEmail: 'avery@example.test' });
let admin: Pool, pool: Pool, app: FastifyInstance;
let authHeaders: Record<string, string>;
async function call(path: string, body: unknown, headers = internalHeaders) { return app.inject({ method: 'POST', url: path, headers, payload: body }); }
async function create(extra = {}) { const response = await call('/internal/v1/tickets/intake', { ...input(), ...extra }); expect(response.statusCode).toBe(201); return response.json().ticket; }
async function claim(ticketId: string) { const response = await call('/internal/v1/jobs/claim', { workerId: 'integration', ticketId }); expect(response.statusCode).toBe(200); return response.json().job; }
async function assessment(ticket: { id: string }, job: { id: string; leaseToken: string }, extra = {}) {
  return call(`/internal/v1/tickets/${ticket.id}/draft`, { jobId: job.id, leaseToken: job.leaseToken, classification: { category: 'integration', priority: 'normal', summary: 'Authorization setup question.' }, draft: 'Set the documented bearer authorization header and test in the sandbox.', sourceIds: ['test-webhook'], disposition: 'review', runId: 'integration-run', ...extra });
}
async function ready(extra = {}) {
  const ticket = await create(extra); const job = await claim(ticket.id);
  const search = await call('/internal/v1/knowledge/search', { jobId: job.id, leaseToken: job.leaseToken, embedding: vector });
  expect(search.statusCode).toBe(200); expect(search.json().sources[0].id).toBe('test-webhook');
  const response = await assessment(ticket, job); expect(response.statusCode).toBe(200);
  return response.json().ticket;
}
async function approve(ticket: { id: string; draftVersion: number }) { return call(`/api/v1/tickets/${ticket.id}/approve`, { expectedVersion: ticket.draftVersion }, authHeaders); }

beforeAll(async () => {
  admin = createPool(process.env.DATABASE_URL!);
  await admin.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public');
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool(config.databaseUrl); await migrate(pool);
  app = (await createApp(config, { pool, migrate: false, seed: false })).app;
}, 30000);
beforeEach(async () => {
  await pool.query('TRUNCATE delivery_outbox,processing_jobs,ticket_events,tickets,reviewer_sessions,knowledge_documents CASCADE');
  const login = await call('/api/v1/auth/login', { token: config.reviewerToken }, { origin: config.appOrigin });
  expect(login.statusCode).toBe(200);
  authHeaders = { origin: config.appOrigin, cookie: login.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': login.json().csrfToken };
  const inserted = await call('/internal/v1/knowledge/upsert', { documents: [{ id: 'test-webhook', title: 'Webhook authorization', content: 'Set the Authorization header to Bearer followed by your workspace integration token. Test in the sandbox.', url: 'https://docs.example.test/webhooks', embedding: vector }] });
  expect(inserted.statusCode).toBe(200);
});
afterAll(async () => { if (app) await app.close(); if (pool) await pool.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); } });

describe('real PostgreSQL API and effect boundaries', () => {
  it('requires reviewer sessions, exact origin and CSRF; workflow auth is separate', async () => {
    expect((await app.inject('/api/v1/tickets')).statusCode).toBe(401);
    expect((await call('/api/v1/auth/login', { token: config.reviewerToken }, {})).statusCode).toBe(403);
    expect((await call('/api/v1/tickets', input(), { cookie: authHeaders.cookie })).statusCode).toBe(403);
    expect((await call('/api/v1/tickets', input(), { ...authHeaders, 'x-csrf-token': 'wrong' })).statusCode).toBe(403);
    expect((await call('/api/v1/tickets', input(), { ...authHeaders, origin: 'https://attacker.example' })).statusCode).toBe(403);
    expect((await call('/internal/v1/jobs/claim', { workerId: 'test' }, { authorization: `Bearer ${config.reviewerToken}` })).statusCode).toBe(401);
    const session = await app.inject({ url: '/api/v1/auth/session', headers: { cookie: authHeaders.cookie } }); expect(session.json().csrfToken).toBe(authHeaders['x-csrf-token']);
    await call('/api/v1/auth/logout', {}, authHeaders); expect((await app.inject({ url: '/api/v1/tickets', headers: authHeaders })).statusCode).toBe(401);
  });
  it('concurrently deduplicates intake and rejects key reuse or oversized input', async () => {
    const data = input(); const results = await Promise.all(Array.from({ length: 12 }, () => call('/internal/v1/tickets/intake', data)));
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(1); expect(results.every(r => [200, 201].includes(r.statusCode))).toBe(true);
    expect(new Set(results.map(r => r.json().ticket.id)).size).toBe(1);
    expect((await pool.query('SELECT * FROM processing_jobs')).rowCount).toBe(1);
    expect((await call('/internal/v1/tickets/intake', { ...data, body: 'Changed' })).statusCode).toBe(409);
    expect((await call('/internal/v1/tickets/intake', { ...input(), body: 'x'.repeat(50_001) })).statusCode).toBe(422);
    expect((await call('/internal/v1/tickets/intake', { ...input(), callbackUrl: 'https://attacker.example' })).statusCode).toBe(422);
  });
  it('rotates sessions and allows repeated valid logins while limiting failed attempts', async () => {
    const originalCookie = authHeaders.cookie;
    let cookie = originalCookie;
    for (let i = 0; i < 12; i++) {
      const login = await call('/api/v1/auth/login', { token: config.reviewerToken }, { origin: config.appOrigin, cookie });
      expect(login.statusCode).toBe(200); cookie = login.cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: originalCookie } })).statusCode).toBe(401);
    for (let i = 0; i < 10; i++) expect((await call('/api/v1/auth/login', { token: 'invalid' }, { origin: config.appOrigin })).statusCode).toBe(401);
    expect((await call('/api/v1/auth/login', { token: 'invalid' }, { origin: config.appOrigin })).statusCode).toBe(429);
    await app.close(); app = (await createApp(config, { pool, migrate: false, seed: false })).app;
  });
  it('binds approval to current draft and atomically creates only one immutable dispatch', async () => {
    const t = await ready(); const edited = await app.inject({ method: 'PATCH', url: `/api/v1/tickets/${t.id}/draft`, headers: authHeaders, payload: { draft: 'A reviewed replacement response.', expectedVersion: 1 } });
    expect(edited.statusCode).toBe(200); expect(edited.json().ticket.draftVersion).toBe(2);
    expect((await approve(t)).statusCode).toBe(409);
    const approvals = await Promise.all([approve(edited.json().ticket), approve(edited.json().ticket)]);
    expect(approvals.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const rows = await pool.query('SELECT * FROM delivery_outbox'); expect(rows.rowCount).toBe(1); expect(rows.rows[0].body).toBe('A reviewed replacement response.'); expect(rows.rows[0].draft_version).toBe(2);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/tickets/${t.id}/draft`, headers: authHeaders, payload: { draft: 'Late change', expectedVersion: 2 } })).statusCode).toBe(409);
  });
  it('rejects rejected-ticket approvals and unknown or missing source evidence', async () => {
    const rejected = await ready(); expect((await call(`/api/v1/tickets/${rejected.id}/reject`, { expectedVersion: 1, reason: 'Needs a custom investigation.' }, authHeaders)).statusCode).toBe(200);
    expect((await approve(rejected)).statusCode).toBe(409);
    const t = await create(); const j = await claim(t.id);
    expect((await assessment(t, j)).statusCode).toBe(422);
    const missing = await assessment(t, j, { sourceIds: [] }); expect(missing.statusCode).toBe(200); expect(missing.json().ticket.status).toBe('needs_attention');
    expect((await approve(missing.json().ticket)).statusCode).toBe(422);
    const sensitive = await ready({ subject: 'Refund requested', body: 'Please refund my invoice now.' }); expect(sensitive.status).toBe('needs_attention'); expect((await approve(sensitive)).statusCode).toBe(422);
    const external = await ready({ customerEmail: 'someone@not-allowed.example' }); expect((await approve(external)).statusCode).toBe(422);
  });
  it('rejects stale leases and idempotently accepts an identical draft callback', async () => {
    const t = await create(); const j = await claim(t.id);
    await call('/internal/v1/knowledge/search', { jobId: j.id, leaseToken: j.leaseToken, embedding: vector });
    expect((await assessment(t, j)).statusCode).toBe(200); expect((await assessment(t, j)).json().ticket.draftVersion).toBe(1);
    expect((await assessment(t, j, { draft: 'Changed replay payload' })).statusCode).toBe(409);
    const other = await create(); const old = await claim(other.id); await pool.query("UPDATE processing_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [old.id]);
    expect((await assessment(other, old, { sourceIds: [] })).statusCode).toBe(409);
    const recovered = await call('/internal/v1/maintenance/recover', {}); expect(recovered.json().jobsRequeued).toBe(1);
    const next = await claim(other.id); expect(next.attempt).toBe(2); expect(next.leaseToken).not.toBe(old.leaseToken);
    expect((await assessment(other, old, { sourceIds: [] })).statusCode).toBe(409);
  });
  it('persists only reported bounded provider telemetry with the assessment', async () => {
    const t = await create(); const j = await claim(t.id);
    await call('/internal/v1/knowledge/search', { jobId: j.id, leaseToken: j.leaseToken, embedding: vector });
    const usage = { model: 'test-reported-model', inputTokens: 125, outputTokens: 32, embeddingTokens: 15, durationMs: 84 };
    expect((await assessment(t, j, { usage: { ...usage, inputTokens: -1 } })).statusCode).toBe(422);
    const result = await assessment(t, j, { usage }); expect(result.statusCode).toBe(200);
    expect((await pool.query('SELECT usage FROM processing_jobs WHERE id=$1', [j.id])).rows[0].usage).toEqual(usage);
    expect(result.json().ticket.events.some((e: { type: string; message: string }) => e.type === 'processing_usage' && e.message.includes('inputTokens=125'))).toBe(true);
  });
  it('persists approval across restart, grants one send claim and never retries an uncertain send', async () => {
    const t = await ready(); await approve(t);
    await app.close(); app = (await createApp(config, { pool, migrate: false, seed: false })).app;
    const claims = await Promise.all(Array.from({ length: 8 }, () => call('/internal/v1/outbox/claim', { workerId: 'parallel-dispatch' })));
    const items = claims.map(r => r.json().item).filter(Boolean); expect(items).toHaveLength(1);
    const item = items[0]; expect(item.body).toBe(t.draft); expect(item.draftVersion).toBe(t.draftVersion);
    expect((await call(`/internal/v1/outbox/${item.id}/sent`, { claimToken: randomUUID(), providerMessageId: 'forged' })).statusCode).toBe(409);
    await pool.query("UPDATE delivery_outbox SET claim_expires_at=now()-interval '1 second' WHERE id=$1", [item.id]);
    await app.close(); app = (await createApp(config, { pool, migrate: false, seed: false })).app;
    expect((await call('/internal/v1/maintenance/recover', {})).json().deliveriesUncertain).toBe(1);
    expect((await call('/internal/v1/outbox/claim', { workerId: 'after-restart' })).json().item).toBeNull();
    expect((await pool.query('SELECT status FROM tickets WHERE id=$1', [t.id])).rows[0].status).toBe('needs_attention');
    const confirmed = await call(`/internal/v1/outbox/${item.id}/sent`, { claimToken: item.claimToken, providerMessageId: 'mailpit-confirmed' }); expect(confirmed.json().ticket.status).toBe('sent');
    expect((await call(`/internal/v1/outbox/${item.id}/sent`, { claimToken: item.claimToken, providerMessageId: 'mailpit-confirmed' })).statusCode).toBe(200);
    expect((await call('/internal/v1/outbox/claim', { workerId: 'no-double-send' })).json().item).toBeNull();
    const audit = (await app.inject({ url: `/api/v1/tickets/${t.id}`, headers: authHeaders })).json().ticket.events;
    expect(audit.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['received', 'draft_ready', 'approved', 'sending', 'delivery_uncertain', 'delivery_sent']));
    expect(audit.filter((e: { type: string }) => e.type === 'delivery_sent')).toHaveLength(1);
  });
  it('caps restart retries at three and blocks ambiguous provider failures from requeue', async () => {
    const t = await create();
    for (let i = 0; i < 3; i++) { const j = await claim(t.id); await pool.query("UPDATE processing_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [j.id]); await call('/internal/v1/maintenance/recover', {}); }
    expect((await claim(t.id))).toBeNull(); expect((await pool.query('SELECT status FROM tickets WHERE id=$1', [t.id])).rows[0].status).toBe('needs_attention');
    const send = await ready(); await approve(send); const item = (await call('/internal/v1/outbox/claim', { workerId: 'smtp-timeout' })).json().item;
    const failed = await call(`/internal/v1/outbox/${item.id}/failure`, { claimToken: item.claimToken, code: 'SMTP_TIMEOUT', message: 'Outcome could not be confirmed.', ambiguous: true }); expect(failed.json().ticket.status).toBe('needs_attention');
    expect((await call('/internal/v1/outbox/claim', { workerId: 'no-resend' })).json().item).toBeNull();
  });
});
