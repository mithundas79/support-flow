export interface Config { databaseUrl: string; reviewerToken: string; workflowToken: string; appOrigin: string; secureCookie: boolean; allowedDomains: string[]; leaseSeconds: number; providerMode: 'fixture' | 'openai'; deliveryMode: 'mailpit' | 'gmail'; }
export function loadConfig(env = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  const reviewerToken = env.REVIEWER_TOKEN;
  const workflowToken = env.WORKFLOW_TOKEN;
  if (!databaseUrl || !reviewerToken || !workflowToken || reviewerToken.length < 24 || workflowToken.length < 24 || reviewerToken === workflowToken) throw new Error('DATABASE_URL and distinct REVIEWER_TOKEN/WORKFLOW_TOKEN (24+ characters) are required.');
  const appOrigin = env.APP_ORIGIN ?? 'http://localhost:5173';
  const origin = new URL(appOrigin);
  if (origin.origin !== appOrigin || !['http:', 'https:'].includes(origin.protocol) || (origin.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw new Error('APP_ORIGIN must be an exact HTTPS origin or loopback HTTP origin.');
  const providerMode = env.AI_PROVIDER_MODE ?? 'fixture'; const deliveryMode = env.DELIVERY_MODE ?? 'mailpit';
  if (providerMode !== 'fixture' && providerMode !== 'openai') throw new Error('AI_PROVIDER_MODE must be fixture or openai.');
  if (deliveryMode !== 'mailpit' && deliveryMode !== 'gmail') throw new Error('DELIVERY_MODE must be mailpit or gmail.');
  return { databaseUrl, reviewerToken, workflowToken, appOrigin, secureCookie: origin.protocol === 'https:', allowedDomains: (env.DELIVERY_ALLOWED_DOMAINS ?? 'example.com,example.test,northstar.example').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), leaseSeconds: 600, providerMode, deliveryMode };
}
