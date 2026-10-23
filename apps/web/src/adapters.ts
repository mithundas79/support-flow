import { createTicketSchema, ticketSchema, type CreateTicketInput, type Ticket } from '@support-flow/contracts';
import { applyReview, createDemoTicket, readDemoState, ReviewError, STORAGE_KEY, type DemoAction } from './demo-store';
import { initialTickets } from './demo-data';

export interface SupportAdapter {
  mode: 'demo' | 'live';
  list(): Promise<Ticket[]>;
  edit(id: string, draft: string, expectedVersion: number): Promise<Ticket>;
  approve(id: string, expectedVersion: number): Promise<Ticket>;
  reject(id: string, expectedVersion: number, reason: string): Promise<Ticket>;
  create(input: CreateTicketInput): Promise<Ticket>;
  subscribe(listener: () => void): () => void;
}

export class DemoAdapter implements SupportAdapter {
  mode = 'demo' as const;
  notice = '';
  private memory: Ticket[] = initialTickets();
  private writable = true;
  private listeners = new Set<() => void>();
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage ?? null;
    if (storage === undefined && typeof window !== 'undefined') {
      try { this.storage = window.localStorage; }
      catch { this.writable = false; this.notice = 'Browser storage is unavailable. Changes will last for this visit only.'; }
    }
    this.read();
    if (typeof window !== 'undefined') window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY || event.key === null) { this.read(); this.emit(); }
    });
  }
  private read() {
    if (!this.storage || !this.writable) return this.memory;
    try {
      const state = readDemoState(this.storage.getItem(STORAGE_KEY));
      this.memory = state.tickets;
      if (state.recovered) {
        this.notice = 'Saved sample data could not be read, so the original examples were restored.';
        this.write(this.memory);
      }
    } catch { this.writable = false; this.notice = 'Browser storage is unavailable. Changes will last for this visit only.'; }
    return this.memory;
  }
  private write(tickets: Ticket[]) {
    this.memory = tickets;
    if (this.storage && this.writable) try { this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tickets })); }
    catch { this.writable = false; this.notice = 'Browser storage is full or unavailable. Changes will last for this visit only.'; }
    this.emit();
  }
  private emit() { this.listeners.forEach(listener => listener()); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async list() { return structuredClone(this.read()); }
  private transaction<T>(operation: () => T): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(STORAGE_KEY, operation);
    return Promise.resolve().then(operation);
  }
  private async change(action: DemoAction) {
    return this.transaction(() => {
      const next = applyReview(this.read(), action); this.write(next);
      return structuredClone(next.find(ticket => ticket.id === action.id)!);
    });
  }
  edit(id: string, draft: string, expectedVersion: number) { return this.change({ type: 'edit', id, draft, expectedVersion }); }
  approve(id: string, expectedVersion: number) { return this.change({ type: 'approve', id, expectedVersion }); }
  reject(id: string, expectedVersion: number, reason: string) { return this.change({ type: 'reject', id, expectedVersion, reason }); }
  async create(input: CreateTicketInput) {
    const valid = createTicketSchema.parse(input);
    return this.transaction(() => {
    const current = this.read();
    const existing = current.find(ticket => ticket.externalId === valid.externalId);
    if (existing) {
      if (['subject', 'body', 'customerName', 'customerEmail'].some(key => existing[key as keyof Ticket] !== valid[key as keyof CreateTicketInput])) throw new ReviewError('idempotency_conflict', 'That email reference already belongs to a different message. Use a new reference.');
      return structuredClone(existing);
    }
    if (current.length >= 100) throw new ReviewError('sample_limit', 'The sample has reached 100 tickets. Reset the demo to add more.');
    const ticket = createDemoTicket(valid); this.write([ticket, ...current]); return ticket;
    });
  }
  async reset() { await this.transaction(() => { this.notice = ''; this.write(initialTickets()); }); }
}

export class HttpAdapter implements SupportAdapter {
  mode = 'live' as const;
  private csrfToken = '';
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private async request(path: string, method = 'GET', body?: unknown) {
    let response: Response;
    try { response = await fetch(`/api/v1${path}`, {
      method, credentials: 'same-origin', signal: AbortSignal.timeout(15_000), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }); } catch { throw new ReviewError('network_error', 'The local support API is unavailable. Check that the API is running, then try again.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new ReviewError(result.error?.code || 'request_failed', result.error?.message || `The request failed (${response.status}). Please try again.`);
    return result;
  }
  async session() { const result = await this.request('/auth/session'); this.csrfToken = result.csrfToken; return Boolean(result.authenticated); }
  async runtime(): Promise<{ providerMode: 'fixture' | 'openai'; deliveryMode: 'mailpit' | 'gmail'; approvalRequired: true }> { return this.request('/runtime'); }
  async login(token: string) { const result = await this.request('/auth/login', 'POST', { token }); this.csrfToken = result.csrfToken; }
  async logout() { await this.request('/auth/logout', 'POST'); this.csrfToken = ''; }
  async list() { const result = await this.request('/tickets'); return (result.tickets as unknown[]).map(ticket => ticketSchema.parse(ticket)); }
  private async mutate(path: string, method: string, body: unknown) {
    const result = await this.request(path, method, body); const ticket = ticketSchema.parse(result.ticket);
    this.listeners.forEach(listener => listener()); return ticket;
  }
  edit(id: string, draft: string, expectedVersion: number) { return this.mutate(`/tickets/${encodeURIComponent(id)}/draft`, 'PATCH', { draft, expectedVersion }); }
  approve(id: string, expectedVersion: number) { return this.mutate(`/tickets/${encodeURIComponent(id)}/approve`, 'POST', { expectedVersion }); }
  reject(id: string, expectedVersion: number, reason: string) { return this.mutate(`/tickets/${encodeURIComponent(id)}/reject`, 'POST', { expectedVersion, reason }); }
  create(input: CreateTicketInput) { return this.mutate('/tickets', 'POST', createTicketSchema.parse(input)); }
}
