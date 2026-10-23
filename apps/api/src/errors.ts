import { ZodError } from 'zod';
import { DomainError } from '@support-flow/core';

interface ClassifiedError { status: number; code: string; message: string; }

export function classifyRequestError(error: unknown): ClassifiedError {
  if (error instanceof ZodError) return { status: 422, code: 'VALIDATION_ERROR', message: 'Request fields are invalid, missing, or exceed allowed limits.' };
  if (error instanceof DomainError) return { status: error.status, code: error.code, message: error.message };
  if (typeof error === 'object' && error !== null && 'statusCode' in error
    && typeof error.statusCode === 'number' && Number.isInteger(error.statusCode)
    && error.statusCode >= 400 && error.statusCode < 500) {
    return { status: error.statusCode, code: 'INVALID_REQUEST', message: 'Request could not be parsed or exceeds the size limit.' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Request failed. Retry only reversible operations.' };
}
