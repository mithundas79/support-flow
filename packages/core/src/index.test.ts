import { describe, it, expect } from 'vitest';
import { assessmentSchema, recipientAllowed, requiresSpecialist, requireReview } from './index.js';
describe('effect boundaries', () => {
  it('routes sensitive requests independently of model disposition', () => {
    expect(requiresSpecialist('Billing issue', 'Please refund this invoice')).toBe(true);
    expect(requiresSpecialist('Webhook 401', 'How do I configure a bearer token?')).toBe(false);
    expect(recipientAllowed('person@evil-example.test', ['example.test'])).toBe(false);
  });
  it('rejects stale or terminal review and model-injected effect fields', () => {
    expect(() => requireReview('awaiting_review', 2, 1)).toThrow('draft changed');
    expect(() => requireReview('sent', 2, 2)).toThrow('cannot be');
    expect(assessmentSchema.safeParse({ disposition: 'review', sendNow: true }).success).toBe(false);
  });
});
