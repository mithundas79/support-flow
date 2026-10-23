import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import {
  api, composeArguments, config, eventually, fixture, getTicket, intake, internal, login,
  messagesTo, processTicket, request, required, ticketInput, workflow,
} from './support.mjs';

let reviewer;
before(async () => {
  required('REVIEWER_TOKEN');
  required('WORKFLOW_TOKEN');
  const health = await request(config.api, '/health');
  assert.equal(health.status, 200, 'the real API must be healthy');
  const reset = await request(config.fixture, '/__control/reset', { method: 'POST', json: {} });
  assert.equal(reset.status, 200, 'the controlled provider fixture must be running');
  reviewer = await login();
  const ingest = await workflow('ingest');
  assert.ok(ingest.ok, `real n8n knowledge ingestion returned HTTP ${ingest.status}`);
});

test('A01/A02: reviewer session, workflow bearer and CSRF/origin boundaries', async () => {
  assert.equal((await request(config.api, '/api/v1/tickets')).status, 401);
  const badLogin = await request(config.api, '/api/v1/auth/login', {
    method: 'POST', json: { token: 'incorrect-fictional-reviewer-token' }, headers: { origin: config.origin },
  });
  assert.equal(badLogin.status, 401);
  const publicCookieInternal = await request(config.api, '/internal/v1/jobs/claim', {
    method: 'POST', json: { workerId: 'qa-unauthorized' }, headers: { cookie: reviewer.cookie, origin: config.origin },
  });
  assert.equal(publicCookieInternal.status, 401);
  const unauthorizedWebhook = await request(config.n8n, '/webhook/northstar-intake', { method: 'POST', json: ticketInput('unauthorized') });
  assert.ok([401, 403].includes(unauthorizedWebhook.status));

  const ticket = await intake(ticketInput('csrf'));
  for (const headers of [
    { cookie: reviewer.cookie, origin: config.origin },
    { cookie: reviewer.cookie, origin: 'https://untrusted.example.test', 'x-csrf-token': reviewer.csrf },
  ]) {
    const mutation = await request(config.api, `/api/v1/tickets/${ticket.id}/approve`, {
      method: 'POST', json: { expectedVersion: ticket.draftVersion }, headers,
    });
    assert.equal(mutation.status, 403, 'session alone must not authorize a state-changing request');
  }
});

test('A03: concurrent authenticated n8n intake deduplicates the same external ID', async () => {
  const input = ticketInput('duplicate');
  const results = await Promise.all(Array.from({ length: 6 }, () => intake(input)));
  assert.equal(new Set(results.map((ticket) => ticket.id)).size, 1);
  const list = await api(reviewer, '/tickets');
  assert.equal(list.status, 200);
  assert.equal(list.body.tickets.filter((ticket) => ticket.externalId === input.externalId).length, 1);
});

test('A01: authenticated malformed intake is rejected before a workflow job is created', async () => {
  for (const overrides of [
    { customerEmail: 'not-an-email' },
    { subject: 'x'.repeat(301) },
    { body: 'x'.repeat(50_001) },
    { unexpectedProperty: 'untrusted extra field' },
  ]) {
    const response = await api(reviewer, '/tickets', {
      method: 'POST', json: ticketInput('invalid', overrides),
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('N01/A04/A05: real workflow creates a grounded draft and dispatches exactly the approved revision', async () => {
  const input = ticketInput('grounded');
  await fixture(input.externalId, 'normal');
  const ready = await processTicket(reviewer, await intake(input));
  assert.equal(ready.status, 'awaiting_review');
  assert.ok(ready.sources.length > 0, 'a ready draft must expose retrieved sources');
  assert.ok(ready.draft.length > 0);
  const stats = await request(config.fixture, '/__control/stats');
  const calls = stats.body.requests.filter((entry) => entry.externalId === input.externalId);
  assert.ok(calls.length >= 3 && calls.length <= 9, 'real n8n must call the controlled classification, embedding and draft providers');
  const revisedText = `${ready.draft}\n\nFictional QA revision: please share a redacted delivery timestamp.`;
  const edit = await api(reviewer, `/tickets/${ready.id}/draft`, {
    method: 'PATCH', json: { draft: revisedText, expectedVersion: ready.draftVersion },
  });
  assert.equal(edit.status, 200);
  const edited = edit.body.ticket;
  assert.equal(edited.draftVersion, ready.draftVersion + 1);
  assert.equal((await api(reviewer, `/tickets/${ready.id}/approve`, {
    method: 'POST', json: { expectedVersion: ready.draftVersion },
  })).status, 409, 'a stale browser must not approve a newer revision');
  assert.equal((await api(reviewer, `/tickets/${ready.id}/draft`, {
    method: 'PATCH', json: { draft: 'Stale overwrite attempt', expectedVersion: ready.draftVersion },
  })).status, 409);
  const competingApprovals = await Promise.all(Array.from({ length: 2 }, () => api(reviewer, `/tickets/${ready.id}/approve`, {
    method: 'POST', json: { expectedVersion: edited.draftVersion },
  })));
  assert.deepEqual(competingApprovals.map((result) => result.status).sort(), [200, 409],
    'concurrent approval must create one immutable outbox snapshot');
  assert.equal((await api(reviewer, `/tickets/${ready.id}/approve`, {
    method: 'POST', json: { expectedVersion: edited.draftVersion },
  })).status, 409, 'repeated approval cannot create another outbox item');

  assert.ok((await workflow('dispatch')).ok);
  const sent = await eventually(() => getTicket(reviewer, ready.id), (ticket) => ticket.status === 'sent');
  assert.equal(sent.draft, revisedText);
  const messages = await eventually(() => messagesTo(input.customerEmail), (items) => items.length === 1, { description: 'one Mailpit message' });
  const message = await request(config.mailpit, `/api/v1/message/${messages[0].ID}`);
  assert.equal(message.status, 200);
  assert.ok(message.body.Text.includes(revisedText), 'delivery must use the approved revision snapshot');
  assert.ok(sent.events.length >= 4, 'persisted audit history must show the review and delivery transitions');
  assert.ok((await workflow('dispatch')).ok);
  assert.equal((await messagesTo(input.customerEmail)).length, 1, 'repeated dispatch cannot resend a completed outbox item');
});

test('A04: rejecting a draft prevents later approval', async () => {
  const input = ticketInput('rejected');
  await fixture(input.externalId, 'normal');
  const ticket = await processTicket(reviewer, await intake(input));
  assert.equal((await api(reviewer, `/tickets/${ticket.id}/reject`, {
    method: 'POST', json: { expectedVersion: ticket.draftVersion, reason: 'Fictional QA review rejected this response.' },
  })).status, 200);
  const rejected = await getTicket(reviewer, ticket.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal((await api(reviewer, `/tickets/${ticket.id}/approve`, {
    method: 'POST', json: { expectedVersion: rejected.draftVersion },
  })).status, 409);
});

for (const scenario of ['no-sources', 'bad-source', 'refusal', 'invalid-json', 'null-json', 'nonarray-output', '429', '500', 'timeout', 'embedding-error']) {
  test(`N02/N04/N05: ${scenario} cannot publish an approvable ungrounded response`, { timeout: 180_000 }, async () => {
    const input = ticketInput(scenario);
    await fixture(input.externalId, scenario);
    const ticket = await processTicket(reviewer, await intake(input));
    assert.ok(['needs_attention', 'failed'].includes(ticket.status), `unsafe provider result became ${ticket.status}`);
    const approval = await api(reviewer, `/tickets/${ticket.id}/approve`, {
      method: 'POST', json: { expectedVersion: ticket.draftVersion },
    });
    assert.equal(approval.status, ticket.status === 'needs_attention' ? 422 : 409);
    if (ticket.status === 'needs_attention') assert.equal(approval.body.error.code, 'SPECIALIST_REQUIRED');
    const stats = await request(config.fixture, '/__control/stats');
    assert.equal(stats.status, 200);
    const calls = stats.body.requests.filter((entry) => entry.externalId === input.externalId);
    assert.ok(calls.length >= 1 && calls.length <= 9, 'one ticket must use the fixture and stay inside the bounded provider call budget');
    assert.equal((await messagesTo(input.customerEmail)).length, 0);
  });
}

test('N03: a sensitive billing request stays with a human specialist', async () => {
  const input = ticketInput('sensitive', {
    subject: 'Refund request', body: 'Please refund the duplicate charge on my subscription.',
  });
  await fixture(input.externalId, 'normal');
  const ticket = await processTicket(reviewer, await intake(input));
  assert.equal(ticket.status, 'needs_attention');
  assert.equal(ticket.category, 'billing');
  const approval = await api(reviewer, `/tickets/${ticket.id}/approve`, {
    method: 'POST', json: { expectedVersion: ticket.draftVersion },
  });
  assert.equal(approval.status, 422);
  assert.equal(approval.body.error.code, 'SPECIALIST_REQUIRED');
  assert.equal((await messagesTo(input.customerEmail)).length, 0);
});

test('N01/N03: the fictional corpus is evaluated against its authored labels', { timeout: 600_000 }, async () => {
  const corpus = JSON.parse(await readFile(new URL('../../fixtures/tickets/labeled.json', import.meta.url), 'utf8'));
  assert.equal(corpus.length, 30);
  const mismatches = [];
  const persistedExpectations = [];
  for (const example of corpus) {
    const input = ticketInput(example.externalId, {
      subject: example.subject, body: example.body,
      customerName: example.customerName,
    });
    await fixture(input.externalId, 'normal');
    const ticket = await processTicket(reviewer, await intake(input));
    assert.match(ticket.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    persistedExpectations.push({ id: ticket.id, example: example.externalId, disposition: example.expectedDisposition });
    const expectedStatus = example.expectedDisposition === 'review' ? 'awaiting_review' : 'needs_attention';
    for (const [field, expected, actual] of [
      ['category', example.expectedCategory, ticket.category],
      ['priority', example.expectedPriority, ticket.priority],
      ['status', expectedStatus, ticket.status],
    ]) {
      if (actual !== expected) mismatches.push({ example: example.externalId, field, expected, actual });
    }
    if (ticket.status === 'awaiting_review' && ticket.sources.length === 0) mismatches.push({ example: example.externalId, field: 'sources', expected: 'nonempty', actual: 0 });
  }
  // Clarification and escalation both become needs_attention in the public DTO.
  // Read only this run's validated UUIDs in one real PostgreSQL query so a wrong
  // disposition cannot pass merely because its public status looks similar.
  const ids = persistedExpectations.map((entry) => `'${entry.id}'`).join(',');
  const sql = `SELECT coalesce(json_agg(json_build_object('id',id,'disposition',disposition)), '[]'::json)::text FROM tickets WHERE id IN (${ids})`;
  const { stdout } = await promisify(execFile)('docker', [
    ...composeArguments(), 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'support_flow', '-d', 'support_flow',
    '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { timeout: 30_000, windowsHide: true });
  const persisted = JSON.parse(stdout.trim());
  assert.equal(persisted.length, 30, 'all corpus tickets must exist in the real database');
  const byId = new Map(persisted.map((entry) => [entry.id, entry.disposition]));
  for (const entry of persistedExpectations) {
    if (byId.get(entry.id) !== entry.disposition) mismatches.push({
      example: entry.example, field: 'disposition', expected: entry.disposition, actual: byId.get(entry.id),
    });
  }
  assert.deepEqual(mismatches, [], 'Controlled-fixture label evaluation must expose every mismatch; this is not live-model accuracy.');
});

test('A07: ambiguous SMTP delivery is retained for attention without blind resend', { timeout: 180_000 }, async () => {
  const input = ticketInput('ambiguous');
  await fixture(input.externalId, 'normal');
  const ready = await processTicket(reviewer, await intake(input));
  assert.equal(ready.status, 'awaiting_review');
  assert.equal((await api(reviewer, `/tickets/${ready.id}/approve`, {
    method: 'POST', json: { expectedVersion: ready.draftVersion },
  })).status, 200);
  await fixture(input.externalId, 'smtp-ambiguous-once');
  assert.ok((await workflow('dispatch')).ok);
  await eventually(() => messagesTo(input.customerEmail), (items) => items.length === 1);
  const attention = await eventually(() => getTicket(reviewer, ready.id), (ticket) => ticket.status === 'needs_attention');
  assert.ok(attention.events.some((event) => /ambiguous|uncertain/i.test(`${event.type} ${event.message}`)));
  for (let i = 0; i < 2; i++) {
    assert.ok((await workflow('recover')).ok);
    assert.ok((await workflow('dispatch')).ok);
  }
  assert.equal((await messagesTo(input.customerEmail)).length, 1);
});

test('A06: pending durable ticket survives an API process restart', {
  skip: process.env.ACCEPTANCE_ALLOW_RESTART !== '1' && 'Set ACCEPTANCE_ALLOW_RESTART=1 only for the disposable fixture stack',
  timeout: 120_000,
}, async () => {
  const input = ticketInput('restart');
  await fixture(input.externalId, 'normal');
  const created = await internal('/tickets/intake', input);
  assert.ok(created.ok);
  const id = created.body.ticket.id;
  await promisify(execFile)('docker', [...composeArguments(), 'restart', 'api'], { timeout: 60_000, windowsHide: true });
  await eventually(async () => {
    try { return await request(config.api, '/health'); } catch { return { status: 0 }; }
  }, (result) => result.status === 200, { description: 'API readiness after restart' });
  reviewer = await login();
  const persisted = await getTicket(reviewer, id);
  assert.equal(persisted.externalId, input.externalId);
  const ready = await processTicket(reviewer, persisted);
  assert.equal(ready.status, 'awaiting_review');
});
