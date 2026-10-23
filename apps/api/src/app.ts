import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { createTicketSchema, loginSchema, rejectTicketSchema, updateDraftSchema, versionSchema } from '@support-flow/contracts';
import { assessmentSchema, claimSchema, deliveryFailureSchema, DomainError, embeddingSchema, failureSchema, knowledgeDocumentSchema, outboxClaimSchema, searchSchema, sentSchema } from '@support-flow/core';
import type { Config } from './config.js';
import { createPool, migrate, seedKnowledge, type Pool } from './db.js';
import { Store } from './store.js';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const idSchema = z.object({ id: z.string().uuid() });

export async function createApp(config: Config, options: { pool?: Pool; migrate?: boolean; seed?: boolean; logger?: boolean } = {}) {
  const pool = options.pool ?? createPool(config.databaseUrl);
  if (options.migrate !== false) await migrate(pool);
  if (options.seed !== false) await seedKnowledge(pool);
  const store = new Store(pool, config);
  const app = Fastify({ bodyLimit: 2_000_000, logger: options.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.headers["x-csrf-token"]'] } : false });
  await app.register(cookie);
  app.addHook('onClose', async () => { if (!options.pool) await pool.end(); });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Request fields are invalid, missing, or exceed allowed limits.' } });
    if (error instanceof DomainError) return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) return reply.status(error.statusCode).send({ error: { code: 'INVALID_REQUEST', message: 'Request could not be parsed or exceeds the size limit.' } });
    app.log.error(error, 'Request failed');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Request failed. Retry only reversible operations.' } });
  });
  const requireOrigin = (req: FastifyRequest) => { if (req.headers.origin !== config.appOrigin) throw new DomainError('INVALID_ORIGIN', 'Request origin is not allowed.', 403); };
  const requireSession = async (req: FastifyRequest) => {
    const token = req.cookies.sf_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new DomainError('UNAUTHENTICATED', 'Sign in to the local reviewer session.', 401);
    const session = (await pool.query('SELECT csrf_token FROM reviewer_sessions WHERE token_hash=$1 AND expires_at>now()', [hash(token)])).rows[0];
    if (!session) throw new DomainError('UNAUTHENTICATED', 'Reviewer session expired.', 401);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      requireOrigin(req);
      const csrf = req.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !equal(csrf, session.csrf_token)) throw new DomainError('INVALID_CSRF', 'Session CSRF token is missing or invalid.', 403);
    }
    return session;
  };
  const loginAttempts = new Map<string, { count: number; until: number }>();
  app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok', database: 'connected' }; });
  app.post('/api/v1/auth/login', async (req, reply) => {
    requireOrigin(req);
    const input = loginSchema.parse(req.body);
    const now = Date.now(); const existing = loginAttempts.get(req.ip);
    if (existing && existing.until > now && existing.count >= 10) throw new DomainError('RATE_LIMITED', 'Too many login attempts. Try again in ten minutes.', 429);
    const attempts = existing && existing.until > now ? existing : { count: 0, until: now + 600_000 };
    attempts.count++; loginAttempts.set(req.ip, attempts);
    if (loginAttempts.size > 1000) for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
    if (!equal(input.token, config.reviewerToken)) throw new DomainError('UNAUTHENTICATED', 'Reviewer token is invalid.', 401);
    loginAttempts.delete(req.ip);
    const token = randomBytes(32).toString('hex'); const csrfToken = randomBytes(32).toString('hex');
    if (req.cookies.sf_session) await pool.query('DELETE FROM reviewer_sessions WHERE token_hash=$1', [hash(req.cookies.sf_session)]);
    await pool.query("INSERT INTO reviewer_sessions(token_hash,csrf_token,expires_at) VALUES($1,$2,now()+interval '12 hours')", [hash(token), csrfToken]);
    reply.setCookie('sf_session', token, { httpOnly: true, secure: config.secureCookie, sameSite: 'strict', path: '/api/v1', maxAge: 43200 });
    return { authenticated: true, csrfToken };
  });
  app.get('/api/v1/auth/session', async req => ({ authenticated: true, csrfToken: (await requireSession(req)).csrf_token }));
  app.get('/api/v1/runtime', async req => { await requireSession(req); return { providerMode: config.providerMode, deliveryMode: config.deliveryMode, approvalRequired: true }; });
  app.post('/api/v1/auth/logout', async (req, reply) => {
    await requireSession(req); await pool.query('DELETE FROM reviewer_sessions WHERE token_hash=$1', [hash(req.cookies.sf_session!)]);
    reply.clearCookie('sf_session', { path: '/api/v1', httpOnly: true, secure: config.secureCookie, sameSite: 'strict' }); return { authenticated: false };
  });
  app.get('/api/v1/tickets', async req => { await requireSession(req); return { tickets: await store.list() }; });
  app.get('/api/v1/tickets/:id', async req => { await requireSession(req); return { ticket: await store.ticket(idSchema.parse(req.params).id) }; });
  app.post('/api/v1/tickets', async (req, reply) => { await requireSession(req); const result = await store.create(createTicketSchema.parse(req.body)); reply.code(result.created ? 201 : 200); return result; });
  app.patch('/api/v1/tickets/:id/draft', async req => { await requireSession(req); const { draft, expectedVersion } = updateDraftSchema.parse(req.body); return { ticket: await store.edit(idSchema.parse(req.params).id, draft, expectedVersion) }; });
  app.post('/api/v1/tickets/:id/approve', async req => { await requireSession(req); const { expectedVersion } = versionSchema.parse(req.body); return { ticket: await store.approve(idSchema.parse(req.params).id, expectedVersion) }; });
  app.post('/api/v1/tickets/:id/reject', async req => { await requireSession(req); const { expectedVersion, reason } = rejectTicketSchema.parse(req.body); return { ticket: await store.reject(idSchema.parse(req.params).id, expectedVersion, reason) }; });
  await app.register(async internal => {
    internal.addHook('preHandler', async req => {
      const value = req.headers.authorization;
      if (!value?.startsWith('Bearer ') || !equal(value.slice(7), config.workflowToken)) throw new DomainError('UNAUTHENTICATED', 'Workflow bearer token is invalid.', 401);
    });
    internal.post('/tickets/intake', async (req, reply) => { const result = await store.create(createTicketSchema.parse(req.body)); reply.code(result.created ? 201 : 200); return result; });
    internal.post('/jobs/claim', async req => { const input = claimSchema.parse(req.body); return { job: await store.claimJob(input.workerId, input.ticketId) }; });
    internal.get('/knowledge/documents', async () => ({ documents: await store.documents() }));
    internal.post('/knowledge/upsert', async req => { const input = z.object({ documents: z.array(knowledgeDocumentSchema.extend({ embedding: embeddingSchema }).strict()).min(1).max(32) }).strict().parse(req.body); return store.upsert(input.documents); });
    internal.post('/knowledge/search', async req => ({ sources: await store.search(searchSchema.parse(req.body)) }));
    internal.post('/tickets/:id/draft', async req => ({ ticket: await store.assessment(idSchema.parse(req.params).id, assessmentSchema.parse(req.body)) }));
    internal.post('/tickets/:id/failure', async req => ({ ticket: await store.processingFailure(idSchema.parse(req.params).id, failureSchema.parse(req.body)) }));
    internal.post('/outbox/claim', async req => ({ item: await store.claimDelivery(outboxClaimSchema.parse(req.body).workerId) }));
    internal.post('/outbox/:id/sent', async req => ({ ticket: await store.deliveryOutcome(idSchema.parse(req.params).id, sentSchema.parse(req.body)) }));
    internal.post('/outbox/:id/failure', async req => ({ ticket: await store.deliveryOutcome(idSchema.parse(req.params).id, deliveryFailureSchema.parse(req.body)) }));
    internal.post('/maintenance/recover', async req => { z.object({}).strict().parse(req.body); return store.recover(); });
  }, { prefix: '/internal/v1' });
  await app.ready();
  return { app, pool, store };
}
