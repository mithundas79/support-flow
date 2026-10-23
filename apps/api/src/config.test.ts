import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
const base = { DATABASE_URL: 'postgresql://localhost/test', REVIEWER_TOKEN: 'reviewer-distinct-random-secret-24', WORKFLOW_TOKEN: 'workflow-distinct-random-secret-24' };
describe('server configuration boundaries', () => {
  it('requires distinct secrets and a precise loopback or HTTPS origin', () => {
    expect(() => loadConfig({ ...base, WORKFLOW_TOKEN: base.REVIEWER_TOKEN })).toThrow('distinct');
    expect(() => loadConfig({ ...base, APP_ORIGIN: 'http://public.example' })).toThrow('loopback');
    expect(() => loadConfig({ ...base, APP_ORIGIN: 'http://localhost:5173/path' })).toThrow('exact');
    expect(loadConfig(base).secureCookie).toBe(false);
    expect(loadConfig({ ...base, APP_ORIGIN: 'https://review.example' }).secureCookie).toBe(true);
  });
});
