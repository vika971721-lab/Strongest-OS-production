import { Telegraf } from 'telegraf';
import type { AppEnv } from './config/env.js';
import { PUBLIC_BOT_COMMANDS } from './config/constants.js';
import { handleAdminCommand } from './commands/adminCommand.js';
import { handleAdminPreviewStatusCommand } from './commands/adminPreviewStatusCommand.js';
import {
  handleAdminExtendCommand,
  handleAdminPaymentCommand,
  handleAdminRetryPaymentCommand,
  handlePaySupportCommand,
} from './commands/paymentCommands.js';
import { handleStartCommand } from './commands/startCommand.js';
import {
  handleCancelCommand,
  handleHelpCommand,
  handleMenuCommand,
  handleStatusCommand,
} from './commands/userCommands.js';
import { handleCallbackQuery } from './handlers/callbackHandlers.js';
import { handleTextMessage } from './handlers/textHandler.js';
import { handleUnknownMessage } from './handlers/unknownHandler.js';
import {
  callbackRateLimitMiddleware,
  InMemoryCallbackRateLimiter,
} from './middleware/rateLimitMiddleware.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { userContextMiddleware } from './middleware/userContextMiddleware.js';
import {
  CouponAttemptLimiter,
  DefaultCouponService,
  MockCouponService,
  type CouponService,
} from './services/couponService.js';
import { MockAccountService, type AccountService } from './services/accountService.js';
import { DefaultAccessStateService } from './services/accessStateService.js';
import { InMemoryConversationStore } from './state/inMemoryConversationStore.js';
import type { AccessStateProvider, UserAccessState } from './types/accessState.js';
import type { BotContext } from './types/context.js';
import { logger, normalizeError } from './utils/logger.js';
import {
  InMemoryPaymentOrderRepository,
  type PaymentOrderRepository,
} from './repositories/paymentOrderRepository.js';
import {
  InMemoryPaymentEventRepository,
  type PaymentEventRepository,
} from './repositories/paymentEventRepository.js';
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
  NotConfiguredPaymentAccessGateway,
  type PaymentAccessGateway,
} from './services/paymentFlow.js';
import { MESSAGES } from './utils/messages.js';
import { getSupabaseAdminClient } from './integrations/supabaseAdmin.js';
import {
  SupabaseCouponRepository,
  type CouponRepository,
} from './repositories/couponRepository.js';
import {
  handleAdminCancelCouponCommand,
  handleAdminCouponInfoCommand,
  handleAdminIssueCouponCommand,
  handleAdminCouponCancelCallback,
} from './commands/couponAdminCommands.js';

export interface BotDependencies {
  conversationStore?: InMemoryConversationStore;
  callbackRateLimiter?: InMemoryCallbackRateLimiter;
  couponService?: CouponService;
  couponRepository?: CouponRepository;
  couponAttemptLimiter?: CouponAttemptLimiter;
  accountService?: AccountService;
  accessStateProvider?: AccessStateProvider;
  paymentOrderRepository?: PaymentOrderRepository;
  paymentEventRepository?: PaymentEventRepository;
  paymentAccessGateway?: PaymentAccessGateway;
}

export const createBot = (
  env: AppEnv,
  dependencies: BotDependencies = {},
): Telegraf<BotContext> => {
  if (!env.botToken) throw new Error('Missing required configuration: BOT_TOKEN');

  const bot = new Telegraf<BotContext>(env.botToken);
  const conversationStore = dependencies.conversationStore ?? new InMemoryConversationStore();
  const callbackRateLimiter = dependencies.callbackRateLimiter ?? new InMemoryCallbackRateLimiter();
  const accountService = dependencies.accountService ?? new MockAccountService();
  const accessStateProvider = dependencies.accessStateProvider ?? new DefaultAccessStateService();
  const paymentOrderRepository =
    dependencies.paymentOrderRepository ?? new InMemoryPaymentOrderRepository();
  const paymentEventRepository =
    dependencies.paymentEventRepository ?? new InMemoryPaymentEventRepository();
  const paymentAccessGateway =
    dependencies.paymentAccessGateway ?? new BotPaymentAccessGateway(accessStateProvider);
  const supabaseClient = getSupabaseAdminClient(env);
  const couponRepository =
    dependencies.couponRepository ??
    (supabaseClient ? new SupabaseCouponRepository(supabaseClient) : undefined);
  const couponService =
    dependencies.couponService ??
    (couponRepository
      ? new DefaultCouponService(couponRepository, paymentAccessGateway)
      : new MockCouponService());
  const couponAttemptLimiter = dependencies.couponAttemptLimiter ?? new CouponAttemptLimiter();
  const uiDeps = {
    env,
    conversationStore,
    accessStateProvider,
    accountService,
    paymentOrderRepository,
    paymentEventRepository,
    paymentAccessGateway,
  };

  bot.use(errorMiddleware());

  bot.use(async (ctx, next) => {
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (text, extra) => originalReply(text, { parse_mode: 'HTML', ...extra });
    await next();
  });
  bot.use(userContextMiddleware());
  bot.use(async (ctx, next) => {
    logger.info(
      { updateType: ctx.updateType, telegramId: ctx.state.user?.telegramId },
      'telegram_update_received',
    );
    await next();
  });
  bot.use(callbackRateLimitMiddleware(callbackRateLimiter));

  if (env.nodeEnv === 'development') {
    void bot.telegram.setMyCommands([...PUBLIC_BOT_COMMANDS]).catch((error: unknown) => {
      logger.warn({ err: normalizeError(error) }, 'set_my_commands_failed');
    });
  }

  bot.start(async (ctx) => handleStartCommand(ctx, conversationStore, accessStateProvider));
  bot.command('menu', async (ctx) => handleMenuCommand(ctx, uiDeps));
  bot.command('status', async (ctx) => handleStatusCommand(ctx, uiDeps));
  bot.command('help', async (ctx) => handleHelpCommand(ctx, uiDeps));
  bot.command('cancel', async (ctx) => handleCancelCommand(ctx, uiDeps));
  bot.command('admin', async (ctx) => handleAdminCommand(ctx, env));
  bot.command('admin_preview_status', async (ctx) => handleAdminPreviewStatusCommand(ctx, env));
  bot.command('paysupport', async (ctx) => handlePaySupportCommand(ctx, env));
  bot.command('admin_payment', async (ctx) =>
    handleAdminPaymentCommand(
      ctx,
      env,
      paymentOrderRepository,
      paymentEventRepository,
      paymentAccessGateway,
    ),
  );
  bot.command('admin_retry_payment', async (ctx) =>
    handleAdminRetryPaymentCommand(ctx, env, paymentOrderRepository, paymentEventRepository),
  );
  bot.command('admin_extend', async (ctx) =>
    handleAdminExtendCommand(ctx, env, paymentAccessGateway),
  );
  bot.command('admin_issue_coupon', async (ctx) =>
    handleAdminIssueCouponCommand(ctx, env, couponRepository),
  );
  bot.command('admin_coupon_info', async (ctx) =>
    handleAdminCouponInfoCommand(ctx, env, couponRepository),
  );
  bot.command('admin_cancel_coupon', async (ctx) =>
    handleAdminCancelCouponCommand(ctx, env, couponRepository),
  );
  bot.action(/^admin_coupon_cancel:/, async (ctx) =>
    handleAdminCouponCancelCallback(ctx, env, couponRepository),
  );
  bot.on('callback_query', async (ctx) => handleCallbackQuery(ctx, uiDeps));
  bot.on('pre_checkout_query', async (ctx) =>
    handlePreCheckoutQuery({
      ctx,
      env,
      accessGateway: paymentAccessGateway,
      orderRepository: paymentOrderRepository,
    }),
  );
  bot.on('text', async (ctx) =>
    handleTextMessage(ctx, { ...uiDeps, couponService, couponAttemptLimiter }),
  );
  bot.on('message', async (ctx, next) => {
    if (ctx.message && 'successful_payment' in ctx.message) {
      await handleSuccessfulPayment({
        ctx,
        env,
        accessGateway: paymentAccessGateway,
        orderRepository: paymentOrderRepository,
        eventRepository: paymentEventRepository,
      });
      return;
    }
    await next();
  });
  bot.on('message', async (ctx) => handleUnknownMessage(ctx));

  bot.catch((error, ctx) => {
    const safeError = normalizeError(error);
    logger.error(
      { err: safeError, updateType: ctx.updateType, telegramId: ctx.state.user?.telegramId },
      'telegraf_catch',
    );
    if (ctx.chat) {
      void ctx.reply(MESSAGES.temporaryError).catch((replyError: unknown) => {
        logger.error({ err: normalizeError(replyError) }, 'telegraf_catch_reply_failed');
      });
    }
  });

  return bot;
};

class BotPaymentAccessGateway
  extends NotConfiguredPaymentAccessGateway
  implements PaymentAccessGateway
{
  constructor(private readonly accessStateProvider: AccessStateProvider) {
    super();
  }

  override async getAccessState(telegramId: string): Promise<UserAccessState> {
    return this.accessStateProvider.getUserAccessState(telegramId);
  }
}
