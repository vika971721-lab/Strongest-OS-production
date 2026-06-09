import type { MiddlewareFn } from 'telegraf';
import { CALLBACK_DATA, RATE_LIMIT_MESSAGE } from '../config/constants.js';
import type { BotContext } from '../types/context.js';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
}

export class InMemoryCallbackRateLimiter {
  private readonly hits = new Map<string, number>();

  constructor(
    private readonly windowMs = 3_000,
    private readonly maxEntries = 1_000,
    private readonly criticalActions = new Set<string>([CALLBACK_DATA.testPayment]),
  ) {}

  check(key: string, action: string, nowMs = Date.now()): RateLimitDecision {
    this.cleanup(nowMs);
    if (!this.criticalActions.has(action)) return { allowed: true };

    const mapKey = `${key}:${action}`;
    const previous = this.hits.get(mapKey);
    if (previous && nowMs - previous < this.windowMs) {
      return { allowed: false, retryAfterMs: this.windowMs - (nowMs - previous) };
    }

    if (this.hits.size >= this.maxEntries) this.cleanup(nowMs, true);
    this.hits.set(mapKey, nowMs);
    return { allowed: true };
  }

  size(): number {
    return this.hits.size;
  }

  private cleanup(nowMs: number, force = false): void {
    for (const [key, timestamp] of this.hits.entries()) {
      if (force || nowMs - timestamp > this.windowMs) this.hits.delete(key);
    }
  }
}

export const callbackRateLimitMiddleware =
  (limiter: InMemoryCallbackRateLimiter): MiddlewareFn<BotContext> =>
  async (ctx, next) => {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) {
      await next();
      return;
    }

    const userKey = ctx.state.user?.telegramId ?? String(callbackQuery.from.id);
    const decision = limiter.check(userKey, callbackQuery.data);
    if (!decision.allowed) {
      await ctx.answerCbQuery(RATE_LIMIT_MESSAGE, { show_alert: false });
      return;
    }

    await next();
  };
