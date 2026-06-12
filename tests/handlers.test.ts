import { describe, expect, it, vi, type MockedFunction } from 'vitest';
import { MENU_BUTTONS } from '../src/config/constants.js';
import { handleStartCommand } from '../src/commands/startCommand.js';
import { handleTextMessage } from '../src/handlers/textHandler.js';
import { InMemoryConversationStore } from '../src/state/inMemoryConversationStore.js';
import { createAwaitingCouponState } from '../src/state/conversationState.js';
import { MockCouponService } from '../src/services/couponService.js';
import { MockAccountService } from '../src/services/accountService.js';
import type { AppEnv } from '../src/config/env.js';
import type { BotContext } from '../src/types/context.js';
import type { AccessStateProvider, UserAccessState } from '../src/types/accessState.js';

const env: AppEnv = {
  nodeEnv: 'development',
  botMode: 'polling',
  botToken: 'token',
  adminTelegramIds: [],
  displayTimezone: 'Asia/Almaty',
  port: 3000,
  pricing: {
    firstPeriodStars: 100,
    renewalPeriodStars: 150,
    firstPeriodDays: 30,
    renewalPeriodDays: 30,
    threeMonthsStars: 399,
    threeMonthsDays: 90,
    sixMonthsStars: 749,
    sixMonthsDays: 180,
    yearlyStars: 1299,
    yearlyDays: 365,
  },
};

const accessStateProvider = (state?: UserAccessState): AccessStateProvider => ({
  getUserAccessState: vi
    .fn()
    .mockResolvedValue(state ?? { kind: 'telegram_registered', telegramId: '1', trialUsed: false }),
});

type ReplyMock = MockedFunction<BotContext['reply']>;
type TestBotContext = BotContext & { reply: ReplyMock };

const createTextCtx = (text: string, chatType = 'private'): TestBotContext =>
  ({
    message: { text },
    chat: { id: 1, type: chatType },
    state: { user: { telegramId: '1', chatId: '1' } },
    reply: vi.fn().mockResolvedValue(undefined) as ReplyMock,
  }) as unknown as TestBotContext;

const deps = (store = new InMemoryConversationStore(), state?: UserAccessState) => ({
  env,
  conversationStore: store,
  couponService: new MockCouponService(),
  accountService: new MockAccountService(),
  accessStateProvider: accessStateProvider(state),
});

describe('handlers', () => {
  it('responds to unknown message with main menu', async () => {
    const ctx = createTextCtx('unknown');
    await handleTextMessage(ctx, deps());
    expect(ctx.reply).toHaveBeenCalledWith(
      'Используй кнопки меню — так бот быстрее приведёт тебя к нужному действию.',
      expect.any(Object),
    );
  });

  it('resets state through /start', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState());
    const ctx = createTextCtx('/start');
    await handleStartCommand(ctx, store, accessStateProvider());
    await expect(store.get('1')).resolves.toBeUndefined();
  });

  it('enters awaiting_coupon from menu button', async () => {
    const store = new InMemoryConversationStore();
    const ctx = createTextCtx(MENU_BUTTONS.activateCoupon);
    await handleTextMessage(ctx, deps(store));
    await expect(store.get('1')).resolves.toMatchObject({ name: 'awaiting_coupon' });
  });

  it('shows active welcome without password', async () => {
    const ctx = createTextCtx('/start');
    await handleStartCommand(
      ctx,
      new InMemoryConversationStore(),
      accessStateProvider({ kind: 'active', status: 'active', telegramId: '1', trialUsed: true }),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Система активна'),
      expect.any(Object),
    );
    expect(ctx.reply).not.toHaveBeenCalledWith(
      expect.stringContaining('пароль'),
      expect.anything(),
    );
  });

  it('blocks private data in groups', async () => {
    const ctx = createTextCtx(MENU_BUTTONS.myAccess, 'group');
    await handleTextMessage(ctx, deps());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('личном чате'), undefined);
  });
});
