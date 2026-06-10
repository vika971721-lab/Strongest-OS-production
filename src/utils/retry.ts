import type { Logger } from 'pino';
import { safeErrorCode } from './logger.js';

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  operation: string;
  logger?: Pick<Logger, 'warn'>;
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isTemporaryError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('tempor') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('rate') ||
    message.includes('5')
  );
};

export const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const isRetryable = options.isRetryable ?? isTemporaryError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= options.attempts || !isRetryable(error)) throw error;
      const exponential = options.baseDelayMs * 2 ** (attempt - 1);
      const delay = Math.min(options.maxDelayMs, exponential) + Math.floor(random() * 100);
      options.logger?.warn(
        { operation: options.operation, attempt, err: { code: safeErrorCode(error) } },
        'temporary_operation_retry',
      );
      await sleep(delay);
    }
  }

  throw lastError;
};
