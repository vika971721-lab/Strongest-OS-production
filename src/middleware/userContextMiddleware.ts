import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '../types/context.js';
import { normalizeTelegramUserContext } from '../utils/telegram.js';

export const userContextMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  ctx.state.user = normalizeTelegramUserContext(ctx);
  await next();
};
