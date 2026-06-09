import { CALLBACK_DATA } from '../config/constants.js';
import type { PaymentService } from '../services/paymentService.js';
import type { BotContext } from '../types/context.js';
import { MESSAGES } from '../utils/messages.js';

export const handleCallbackQuery = async (
  ctx: BotContext,
  paymentService: PaymentService,
): Promise<void> => {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  await ctx.answerCbQuery();

  if (data === CALLBACK_DATA.testPayment) {
    const telegramId = ctx.state.user?.telegramId ?? String(callbackQuery.from.id);
    const result = await paymentService.createPayment({
      telegramId,
      amountStars: 0,
      description: 'Mock payment availability check',
    });
    await ctx.reply(result.message);
    return;
  }

  if (data === CALLBACK_DATA.installAndroid) {
    await ctx.reply(MESSAGES.androidInstallation);
    return;
  }

  if (data === CALLBACK_DATA.installIphone) {
    await ctx.reply(MESSAGES.iphoneInstallation);
    return;
  }
};
