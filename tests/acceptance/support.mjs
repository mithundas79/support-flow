import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Local .env stays ignored; CI supplies the same values as environment variables.
if (existsSync('.env') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');

export const config = {
  api: process.env.ACCEPTANCE_API_URL ?? 'http://127.0.0.1:3000',
  n8n: process.env.ACCEPTANCE_N8N_URL ?? 'http://127.0.0.1:5678',
  fixture: process.env.ACCEPTANCE_FIXTURE_URL ?? 'http://127.0.0.1:4010',
  mailpit: process.env.ACCEPTANCE_MAILPIT_URL ?? 'http://127.0.0.1:8025',
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
};

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real-stack acceptance suite; see tests/acceptance/README.md`);
  return value;
}

export function composeArguments() {
  const args = ['compose', ...(process.env.ACCEPTANCE_COMPOSE_FILES ?? 'docker-compose.yml')
    .split(',').flatMap((file) => ['-f', file])];
  const project = process.env.ACCEPTANCE_COMPOSE_PROJECT ?? process.env.COMPOSE_PROJECT_NAME;
  if (project) args.push('--project-name', project);
  return args;
}

export async function request(base, path, { method = 'GET', json, headers = {}, timeout = 90_000 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(json === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    signal: AbortSignal.timeout(timeout),
    redirect: 'error',
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { nonJson: true }; }
  return { status: response.status, ok: response.ok, headers: response.headers, body };
}

export async function login() {
  const result = await request(config.api, '/api/v1/auth/login', {
    method: 'POST', json: { token: required('REVIEWER_TOKEN') }, headers: { origin: config.origin },
  });
  if (!result.ok || !result.body?.csrfToken) throw new Error(`Reviewer login failed with HTTP ${result.status}`);
  const cookies = result.headers.getSetCookie?.() ?? [result.headers.get('set-cookie')];
  const cookie = cookies.filter(Boolean).map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Reviewer login did not set a session cookie');
  return { cookie, csrf: result.body.csrfToken };
}

export function api(session, path, options = {}) {
  return request(config.api, `/api/v1${path}`, {
    ...options,
    headers: { cookie: session.cookie, origin: config.origin, 'x-csrf-token': session.csrf, ...options.headers },
  });
}

export function workflow(path, json = {}) {
  return request(config.n8n, `/webhook/northstar-${path}`, {
    method: 'POST', json, headers: { authorization: `Bearer ${required('WORKFLOW_TOKEN')}` },
  });
}

export function internal(path, json) {
  return request(config.api, `/internal/v1${path}`, {
    method: 'POST', json, headers: { authorization: `Bearer ${required('WORKFLOW_TOKEN')}` },
  });
}

export async function fixture(externalId, scenario) {
  const result = await request(config.fixture, '/__control', { method: 'POST', json: { externalId, scenario } });
  if (!result.ok) throw new Error(`Provider fixture control failed with HTTP ${result.status}`);
}

export async function eventually(read, predicate, { timeout = 45_000, description = 'expected persisted state' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    last = await read();
    if (predicate(last)) return last;
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}; last status=${last?.status ?? last?.body?.ticket?.status ?? 'unknown'}`);
}

let sequence = 0;
const runId = `${Date.now().toString(36)}-${process.pid}`;
export function ticketInput(label, overrides = {}) {
  const externalId = `qa-${runId}-${++sequence}-${label}`;
  return {
    externalId,
    subject: 'Webhook signature verification fails',
    body: 'Our Northstar webhook receiver returns a signature error. What header and signing secret should we use?',
    customerName: 'Fictional QA Customer',
    customerEmail: `${externalId}@example.test`,
    ...overrides,
  };
}

export async function intake(input) {
  const result = await workflow('intake', input);
  if (!result.ok) throw new Error(`n8n intake failed with HTTP ${result.status}`);
  const ticket = result.body?.ticket ?? result.body?.data?.ticket;
  if (!ticket?.id) throw new Error('n8n intake did not return the persisted ticket ID');
  return ticket;
}

export async function getTicket(session, id) {
  const result = await api(session, `/tickets/${id}`);
  if (!result.ok || !result.body?.ticket) throw new Error(`Reading persisted ticket failed with HTTP ${result.status}`);
  return result.body.ticket;
}

export async function processTicket(session, ticket) {
  // Each webhook executes one durable attempt. Retryable failures requeue the
  // job; drive the same bounded workflow rather than waiting for its schedule.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await workflow('process', { ticketId: ticket.id });
    if (!result.ok) throw new Error(`n8n processing failed with HTTP ${result.status}`);
    const persisted = await getTicket(session, ticket.id);
    if (!['received', 'processing'].includes(persisted.status)) return persisted;
    if (persisted.status === 'processing') break;
  }
  return eventually(() => getTicket(session, ticket.id), (value) => !['received', 'processing'].includes(value.status));
}

export async function messagesTo(email) {
  const result = await request(config.mailpit, '/api/v1/messages');
  if (!result.ok || !Array.isArray(result.body?.messages)) throw new Error(`Mailpit inspection failed with HTTP ${result.status}`);
  return result.body.messages.filter((message) => (message.To ?? []).some((to) => to.Address === email));
}
