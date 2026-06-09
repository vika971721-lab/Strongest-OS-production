import { describe, expect, it, vi } from 'vitest';
import { MENU_BUTTONS } from '../src/config/constants.js';
import { handleStartCommand } from '../src/commands/startCommand.js';
import { handleTextMessage } from '../src/handlers/textHandler.js';
import { InMemoryConversationStore } from '../src/state/inMemoryConversationStore.js';
import { createAwaitingCouponState } from '../src/state/conversationState.js';
import { MockCouponService } from '../src/services/couponService.js';
import type { AppEnv } from '../src/config/env.js';
import type { BotContext } from '../src/types/context.js';

const env: AppEnv = {
  nodeEnv: 'development',
  botMode: 'polling',
  botToken: 'token',
  adminTelegramIds: [],
  port: 3000,
  pricing: {
    firstPeriodStars: 100,
    renewalPeriodStars: 150,
    firstPeriodDays: 30,
    renewalPeriodDays: 30,
  },
};

const createTextCtx = (text: string): BotContext =>
  ({
    message: { text },
    state: { user: { telegramId: '1', chatId: '1' } },
    reply: vi.fn().mockResolvedValue(undefined),
  }) as unknown as BotContext;

describe('handlers', () => {
  it('responds to unknown message with main menu', async () => {
    const ctx = createTextCtx('unknown');
    await handleTextMessage(ctx, {
      env,
      conversationStore: new InMemoryConversationStore(),
      couponService: new MockCouponService(),
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      'Используйте кнопки меню, чтобы выбрать действие.',
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );
  });

  it('resets state through /start', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState());
    const ctx = createTextCtx('/start');
    await handleStartCommand(ctx, store);
    await expect(store.get('1')).resolves.toBeUndefined();
  });

  it('enters awaiting_coupon from menu button', async () => {
    const store = new InMemoryConversationStore();
    const ctx = createTextCtx(MENU_BUTTONS.activateCoupon);
    await handleTextMessage(ctx, {
      env,
      conversationStore: store,
      couponService: new MockCouponService(),
    });
    await expect(store.get('1')).resolves.toMatchObject({ name: 'awaiting_coupon' });
  });
});
