import { describe, expect, it } from 'vitest';
import { createTicketSchema, updateDraftSchema, versionSchema } from './index.js';

describe('public request boundaries', () => {
  const ticket = { externalId: 'demo-001', subject: 'Help signing in', body: 'My fictional account is locked.', customerName: 'Avery Sample', customerEmail: 'avery@example.test' };
  it('accepts a bounded ticket and rejects provider configuration in browser input', () => {
    expect(createTicketSchema.parse(ticket)).toEqual(ticket);
    expect(createTicketSchema.safeParse({ ...ticket, workflowToken: 'untrusted' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...ticket, body: 'x'.repeat(50_001) }).success).toBe(false);
  });
  it('requires integer nonnegative review versions and a nonempty bounded revision', () => {
    expect(versionSchema.safeParse({ expectedVersion: 1.5 }).success).toBe(false);
    expect(versionSchema.safeParse({ expectedVersion: -1 }).success).toBe(false);
    expect(updateDraftSchema.safeParse({ expectedVersion: 1, draft: '   ' }).success).toBe(false);
    expect(updateDraftSchema.safeParse({ expectedVersion: 1, draft: 'Approved revision' }).success).toBe(true);
  });
});
