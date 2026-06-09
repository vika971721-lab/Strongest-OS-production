import { describe, expect, it } from 'vitest';
import { CALLBACK_DATA } from '../src/config/constants.js';
import { InMemoryCallbackRateLimiter } from '../src/middleware/rateLimitMiddleware.js';

describe('callback rate limiter', () => {
  it('limits repeated critical callback', () => {
    const limiter = new InMemoryCallbackRateLimiter(3000);
    expect(limiter.check('1', CALLBACK_DATA.testPayment, 1000).allowed).toBe(true);
    expect(limiter.check('1', CALLBACK_DATA.testPayment, 1500).allowed).toBe(false);
    expect(limiter.check('1', CALLBACK_DATA.testPayment, 5000).allowed).toBe(true);
  });

  it('does not block normal navigation callback', () => {
    const limiter = new InMemoryCallbackRateLimiter(3000);
    expect(limiter.check('1', CALLBACK_DATA.installAndroid, 1000).allowed).toBe(true);
    expect(limiter.check('1', CALLBACK_DATA.installAndroid, 1001).allowed).toBe(true);
  });
});
