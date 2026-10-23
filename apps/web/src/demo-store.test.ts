import { describe, expect, it, vi, afterEach } from 'vitest';
import { applyReview, readDemoState, STORAGE_KEY } from './demo-store';
import { initialTickets } from './demo-data';
import { DemoAdapter, HttpAdapter } from './adapters';

describe('version-bound human review', () => {
  it('edits immutably and rejects an approval for an older version', () => {
    const original = initialTickets();
    const edited = applyReview(original, { type: 'edit', id: 'ns-1042', expectedVersion: 1, draft: 'A clearer reply.' });
    expect(original[0].draftVersion).toBe(1);
    expect(edited[0]).toMatchObject({ draft: 'A clearer reply.', draftVersion: 2, status: 'awaiting_review' });
    expect(edited[0].events.at(-1)?.message).toContain('fresh review');
    expect(() => applyReview(edited, { type: 'approve', id: 'ns-1042', expectedVersion: 1 })).toThrow('changed in another tab');
    const approved = applyReview(edited, { type: 'approve', id: 'ns-1042', expectedVersion: 2 });
    expect(approved[0].status).toBe('approved');
    expect(approved[0].events.at(-1)?.message).toContain('No email was sent');
    expect(() => applyReview(approved, { type: 'approve', id: 'ns-1042', expectedVersion: 2 })).toThrow('already been reviewed');
    expect(() => applyReview(approved, { type: 'edit', id: 'ns-1042', expectedVersion: 2, draft: 'Changed after approval' })).toThrow('already been reviewed');
  });
  it('blocks escalation and no-source approval even after an edit', () => {
    const edited = applyReview(initialTickets(), { type: 'edit', id: 'ns-1040', expectedVersion: 1, draft: 'Escalate for verification.' });
    expect(edited[2].status).toBe('needs_attention');
    expect(() => applyReview(edited, { type: 'approve', id: 'ns-1040', expectedVersion: 2 })).toThrow('specialist review');
    const missingSources = initialTickets(); missingSources[0].sources = [];
    expect(() => applyReview(missingSources, { type: 'approve', id: 'ns-1042', expectedVersion: 1 })).toThrow('specialist review');
  });
  it('requires nonempty edits and rejection reasons; rejected content cannot be approved', () => {
    expect(() => applyReview(initialTickets(), { type: 'edit', id: 'ns-1042', expectedVersion: 1, draft: '   ' })).toThrow('Enter a draft');
    expect(() => applyReview(initialTickets(), { type: 'reject', id: 'ns-1040', expectedVersion: 1, reason: ' ' })).toThrow('Add a reason');
    const rejected = applyReview(initialTickets(), { type: 'reject', id: 'ns-1040', expectedVersion: 1, reason: 'Needs billing verification' });
    expect(rejected[2].status).toBe('rejected');
    expect(rejected[2].events.at(-1)?.message).toContain('Needs billing verification');
    expect(() => applyReview(rejected, { type: 'approve', id: 'ns-1040', expectedVersion: 1 })).toThrow('already been reviewed');
  });
});

describe('demo persistence and cross-tab resilience', () => {
  function memoryStorage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
  it('validates storage and recovers malformed, incompatible and duplicate state', () => {
    expect(readDemoState(null).recovered).toBe(false);
    for (const raw of ['{broken', '{}', JSON.stringify({ version: 2, tickets: [] }), JSON.stringify({ version: 1, tickets: [{ id: 'missing fields' }] }), JSON.stringify({ version: 1, tickets: [initialTickets()[0], initialTickets()[0]] })]) {
      expect(readDemoState(raw)).toMatchObject({ recovered: true });
      expect(readDemoState(raw).tickets).toHaveLength(3);
    }
  });
  it('persists decisions across adapters and reads current storage before an action', async () => {
    const storage = memoryStorage(); const first = new DemoAdapter(storage); const second = new DemoAdapter(storage);
    await first.edit('ns-1042', 'New version', 1);
    await expect(second.approve('ns-1042', 1)).rejects.toThrow('changed in another tab');
    await second.approve('ns-1042', 2);
    expect((await new DemoAdapter(storage).list())[0].status).toBe('approved');
    await first.reset();
    expect((await second.list())[0]).toMatchObject({ status: 'awaiting_review', draftVersion: 1 });
    expect(storage.getItem(STORAGE_KEY)).toContain('"version":1');
  });
  it('keeps working in memory when storage fails', async () => {
    const adapter = new DemoAdapter({ getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } });
    await adapter.edit('ns-1042', 'In memory reply', 1);
    expect((await adapter.list())[0].draft).toBe('In memory reply');
    expect(adapter.notice).toContain('this visit only');
  });
  it('marks custom emails as ungrounded and handles idempotency consistently', async () => {
    const adapter = new DemoAdapter(null);
    const input = { externalId: 'custom-1', subject: 'A new question', body: 'Please help', customerName: 'Alex Sample', customerEmail: 'alex@example.test' };
    const created = await adapter.create(input);
    expect(created).toMatchObject({ status: 'needs_attention', sources: [], draft: '' });
    expect((await adapter.create(input)).id).toBe(created.id);
    await expect(adapter.create({ ...input, body: 'Different content' })).rejects.toThrow('different message');
  });
});

describe('real API adapter', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps the reviewer token out of persistent state and sends session CSRF on mutations', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, csrfToken: 'test-csrf' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ ticket: initialTickets()[0] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const adapter = new HttpAdapter(); await adapter.login('local-reviewer-token'); await adapter.edit('ns-1042', 'Edited reply', 1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/auth/login');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ token: 'local-reviewer-token' });
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PATCH', credentials: 'same-origin', headers: { 'X-CSRF-Token': 'test-csrf' } });
    expect(fetcher.mock.calls[1][1].body).not.toContain('local-reviewer-token');
  });
  it('surfaces backend error messages and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'Draft version is stale.' } }), { status: 409 })).mockRejectedValueOnce(new TypeError('Failed to fetch')));
    const adapter = new HttpAdapter();
    await expect(adapter.approve('ns-1042', 0)).rejects.toThrow('Draft version is stale');
    await expect(adapter.list()).rejects.toThrow('local support API is unavailable');
  });
});
