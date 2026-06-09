import type { AppEnv } from '../config/env.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { UserAccessState } from '../types/accessState.js';
import type { BotContext } from '../types/context.js';
import { buildAccessMessage, MESSAGES } from '../utils/messages.js';

const previewStates = [
  'unregistered',
  'pending',
  'active',
  'expired',
  'cancelled',
  'banned',
  'marked_for_deletion',
  'deleted',
  'broken_link',
  'error',
] as const;

type PreviewState = (typeof previewStates)[number];

const isPreviewState = (value: string): value is PreviewState =>
  (previewStates as readonly string[]).includes(value);

const buildPreviewState = (value: PreviewState): UserAccessState => {
  const base = { telegramId: 'preview', loginEmail: 'preview@example.com', trialUsed: true };
  const future = '2026-07-25T10:00:00.000Z';
  const deleteAfter = '2026-09-25T10:00:00.000Z';
  switch (value) {
    case 'unregistered':
      return { kind: 'unregistered', ...base, trialUsed: false };
    case 'pending':
      return { kind: 'account_pending', status: 'pending', ...base, trialUsed: false };
    case 'active':
      return { kind: 'active', status: 'active', ...base, expiresAt: future };
    case 'expired':
      return {
        kind: 'expired',
        status: 'expired',
        ...base,
        expiresAt: '2026-05-01T10:00:00.000Z',
        deleteAfter,
      };
    case 'cancelled':
      return { kind: 'cancelled', status: 'cancelled', ...base };
    case 'banned':
      return { kind: 'banned', status: 'banned', ...base };
    case 'marked_for_deletion':
      return { kind: 'marked_for_deletion', status: 'marked_for_deletion', ...base, deleteAfter };
    case 'deleted':
      return { kind: 'deleted', status: 'deleted', ...base };
    case 'broken_link':
      return { kind: 'broken_link', reason: 'preview', ...base };
    case 'error':
      return { kind: 'temporarily_unavailable', telegramId: 'preview' };
  }
};

export const handleAdminPreviewStatusCommand = async (
  ctx: BotContext,
  env: AppEnv,
): Promise<void> => {
  if (env.nodeEnv === 'production') return;
  if (!isAdminContext(ctx, env.adminTelegramIds)) {
    await ctx.reply(MESSAGES.adminForbidden);
    return;
  }
  const message = ctx.message;
  const text = message && 'text' in message ? message.text : '';
  const [, rawStatus] = text.trim().split(/\s+/);
  if (!rawStatus || !isPreviewState(rawStatus)) {
    await ctx.reply(`Доступные preview: ${previewStates.join(', ')}`);
    return;
  }
  await ctx.reply(buildAccessMessage(buildPreviewState(rawStatus), env.displayTimezone));
};
