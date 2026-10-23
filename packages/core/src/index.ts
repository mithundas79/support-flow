import { z } from 'zod';
import { ticketCategorySchema, ticketPrioritySchema } from '@support-flow/contracts';

export class DomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}
export const leaseSchema = z.object({ jobId: z.string().uuid(), leaseToken: z.string().uuid() });
export const claimSchema = z.object({ workerId: z.string().min(1).max(100), ticketId: z.string().uuid().optional() }).strict();
export const embeddingSchema = z.array(z.number().finite().min(-1_000_000).max(1_000_000)).length(1536).refine(v => v.some(n => n !== 0), 'Embedding must have a nonzero norm');
export const knowledgeDocumentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/), title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(10_000), url: z.string().url().startsWith('https://').max(2000).optional(),
});
export const searchSchema = leaseSchema.extend({ embedding: embeddingSchema, limit: z.number().int().min(1).max(6).default(4), minScore: z.number().min(0).max(1).default(0.32) }).strict();
export const processingUsageSchema = z.object({
  inputTokens: z.number().int().min(0).max(1_000_000).optional(), outputTokens: z.number().int().min(0).max(1_000_000).optional(),
  embeddingTokens: z.number().int().min(0).max(1_000_000).optional(), durationMs: z.number().int().min(0).max(3_600_000).optional(),
  model: z.string().min(1).max(150).optional(),
}).strict();
export type ProcessingUsage = z.infer<typeof processingUsageSchema>;
export const assessmentSchema = leaseSchema.extend({
  classification: z.object({ category: ticketCategorySchema, priority: ticketPrioritySchema, summary: z.string().trim().min(1).max(2000) }).strict(),
  draft: z.string().trim().min(1).max(10_000), sourceIds: z.array(z.string().min(1).max(150)).max(6),
  disposition: z.enum(['review', 'clarification', 'escalate']), runId: z.string().min(1).max(200), usage: processingUsageSchema.optional(),
}).strict();
export const failureSchema = leaseSchema.extend({ code: z.string().min(1).max(100), message: z.string().min(1).max(2000), runId: z.string().min(1).max(200), retryable: z.boolean() }).strict();
export const outboxClaimSchema = z.object({ workerId: z.string().min(1).max(100) }).strict();
export const sentSchema = z.object({ claimToken: z.string().uuid(), providerMessageId: z.string().min(1).max(500) }).strict();
export const deliveryFailureSchema = z.object({ claimToken: z.string().uuid(), code: z.string().min(1).max(100), message: z.string().min(1).max(2000), ambiguous: z.boolean() }).strict();
export function requiresSpecialist(subject: string, body: string): boolean {
  return /\b(refund|chargeback|credit card|card number|delete (?:my |the |an? )?account|change (?:my |the )?(?:email|owner)|transfer ownership|disable (?:my |the )?(?:mfa|2fa)|api secret|private key|password is)\b/i.test(`${subject}\n${body}`);
}
export function recipientAllowed(email: string, domains: readonly string[]): boolean {
  return domains.includes(email.split('@').at(-1)!.toLowerCase());
}
export function requireReview(status: string, currentVersion: number, expectedVersion: number): void {
  if (currentVersion !== expectedVersion) throw new DomainError('STALE_VERSION', 'The draft changed. Reload the ticket before reviewing it.');
  if (!['awaiting_review', 'needs_attention'].includes(status)) throw new DomainError('INVALID_STATE', `Ticket in ${status} cannot be edited or reviewed.`);
}
