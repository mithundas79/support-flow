import { ticketSchema, type CreateTicketInput, type Ticket } from '@support-flow/contracts';
import { initialTickets } from './demo-data';

export const STORAGE_KEY = 'support-flow.demo.v1';
export class ReviewError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ReviewError'; }
}
export type DemoAction =
  | { type: 'edit'; id: string; expectedVersion: number; draft: string }
  | { type: 'approve'; id: string; expectedVersion: number }
  | { type: 'reject'; id: string; expectedVersion: number; reason: string };

export function applyReview(tickets: Ticket[], action: DemoAction, now = new Date().toISOString()): Ticket[] {
  const ticket = tickets.find(item => item.id === action.id);
  if (!ticket) throw new ReviewError('not_found', 'This ticket is no longer available. Return to the inbox and try again.');
  if (ticket.draftVersion !== action.expectedVersion) throw new ReviewError('version_conflict', 'This draft changed in another tab. Your text is still here. Copy it if needed, then cancel editing to review the latest version.');
  if (!['awaiting_review', 'needs_attention'].includes(ticket.status)) throw new ReviewError('invalid_state', 'This ticket has already been reviewed. Return to the inbox to see its current status.');
  let patch: Partial<Ticket>;
  let message: string;
  if (action.type === 'edit') {
    const draft = action.draft.trim();
    if (!draft || draft.length > 10_000) throw new ReviewError('invalid_draft', 'Enter a draft between 1 and 10,000 characters.');
    patch = { draft, draftVersion: ticket.draftVersion + 1 };
    message = `Draft revised. Version ${ticket.draftVersion + 1} requires a fresh review.`;
  } else if (action.type === 'approve') {
    if (ticket.status !== 'awaiting_review' || !ticket.sources.length || !ticket.draft.trim()) throw new ReviewError('human_attention', 'This ticket needs specialist review and cannot be approved as a routine reply.');
    patch = { status: 'approved' };
    message = `Version ${ticket.draftVersion} approved in this sample. No email was sent.`;
  } else {
    const reason = action.reason.trim();
    if (!reason || reason.length > 2_000) throw new ReviewError('invalid_reason', 'Add a reason between 1 and 2,000 characters.');
    patch = { status: 'rejected' };
    message = `Draft rejected: ${reason}. No email was sent.`;
  }
  return tickets.map(item => item.id !== ticket.id ? item : {
    ...item, ...patch, updatedAt: now,
    events: [...item.events, { id: `${action.type}-${now}-${ticket.events.length}`, type: action.type, message, createdAt: now }],
  });
}

export function readDemoState(raw: string | null): { tickets: Ticket[]; recovered: boolean } {
  if (raw === null) return { tickets: initialTickets(), recovered: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('tickets' in parsed) || !Array.isArray(parsed.tickets) || parsed.tickets.length > 100) throw new Error('Invalid state');
    const tickets = parsed.tickets.map(value => ticketSchema.parse(value));
    if (new Set(tickets.map(ticket => ticket.id)).size !== tickets.length) throw new Error('Duplicate IDs');
    return { tickets, recovered: false };
  } catch { return { tickets: initialTickets(), recovered: true }; }
}

export function createDemoTicket(input: CreateTicketInput, now = new Date().toISOString()): Ticket {
  return {
    ...input, id: `sample-${crypto.randomUUID()}`, category: 'other', priority: 'normal', status: 'needs_attention',
    summary: 'A custom sample has no prepared retrieval result. Review it manually; no provider has been called.',
    draft: '', draftVersion: 0, sources: [], createdAt: now, updatedAt: now,
    events: [{ id: `intake-${now}`, type: 'received', message: 'Custom sample added. No provider was called and no email was sent.', createdAt: now }],
  };
}
