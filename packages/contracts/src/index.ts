import { z } from 'zod';

export const API_PREFIX = '/api/v1';
export const INTERNAL_PREFIX = '/internal/v1';
export const ticketStatuses = ['received', 'processing', 'awaiting_review', 'needs_attention', 'approved', 'sending', 'sent', 'rejected', 'failed'] as const;
export const ticketCategories = ['access', 'integration', 'billing', 'configuration', 'other'] as const;
export const ticketPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export const ticketStatusSchema = z.enum(ticketStatuses);
export const ticketCategorySchema = z.enum(ticketCategories);
export const ticketPrioritySchema = z.enum(ticketPriorities);
export const sourceSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), excerpt: z.string(), url: z.string().url().optional(),
});
export const ticketEventSchema = z.object({
  id: z.string().min(1), type: z.string().min(1), message: z.string(), createdAt: z.string().datetime(),
});
export const ticketSchema = z.object({
  id: z.string().min(1), externalId: z.string().min(1), subject: z.string().min(1), body: z.string(),
  customerName: z.string(), customerEmail: z.string().email(), category: ticketCategorySchema,
  priority: ticketPrioritySchema, status: ticketStatusSchema, summary: z.string(), draft: z.string(),
  draftVersion: z.number().int().nonnegative(), sources: z.array(sourceSchema), events: z.array(ticketEventSchema),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const createTicketSchema = z.object({
  externalId: z.string().trim().min(1).max(256), subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50_000), customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().trim().email().max(320),
}).strict();
export const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
export const updateDraftSchema = z.object({
  draft: z.string().trim().min(1).max(10_000), expectedVersion: z.number().int().nonnegative(),
}).strict();
export const rejectTicketSchema = z.object({
  expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2_000),
}).strict();
export const loginSchema = z.object({ token: z.string().min(1).max(512) }).strict();
export const apiErrorSchema = z.object({ code: z.string(), message: z.string() });
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type Source = z.infer<typeof sourceSchema>;
export type TicketEvent = z.infer<typeof ticketEventSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type RejectTicketInput = z.infer<typeof rejectTicketSchema>;
export type VersionInput = z.infer<typeof versionSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
