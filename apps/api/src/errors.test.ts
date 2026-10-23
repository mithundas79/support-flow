import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { DomainError } from '@support-flow/core';
import { classifyRequestError } from './errors.js';

describe('safe request error classification', () => {
  it('preserves validation and controlled domain error responses', () => {
    const invalid = classifyRequestError(new ZodError([{ code: 'custom', path: [], message: 'private validation detail' }]));
    expect(invalid.status).toBe(422); expect(invalid.code).toBe('VALIDATION_ERROR'); expect(invalid.message).not.toContain('private');
    const denied = classifyRequestError(new DomainError('STALE_VERSION', 'Reload the current draft.', 409));
    expect(denied).toEqual({ status: 409, code: 'STALE_VERSION', message: 'Reload the current draft.' });
  });
  it('retains framework 4xx statuses without exposing internal exception messages', () => {
    for (const statusCode of [400, 413, 429]) {
      const classified = classifyRequestError(Object.assign(new Error('private parser detail'), { statusCode }));
      expect(classified.status).toBe(statusCode); expect(classified.code).toBe('INVALID_REQUEST'); expect(classified.message).not.toContain('private');
    }
  });
  it('turns malformed, primitive and server errors into a safe 500 response', () => {
    const unknownErrors: unknown[] = [null, undefined, 42, 'private failure', new Error('private database detail'), { statusCode: 503, message: 'private provider detail' }, { statusCode: '401' }, { statusCode: 422.5 }, { statusCode: Infinity }];
    for (const error of unknownErrors) {
      const classified = classifyRequestError(error);
      expect(classified.status).toBe(500); expect(classified.code).toBe('INTERNAL_ERROR'); expect(classified.message).not.toContain('private');
    }
  });
});
