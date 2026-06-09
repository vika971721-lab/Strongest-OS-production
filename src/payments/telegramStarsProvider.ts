import type { PaymentProvider } from './paymentProvider.js';
import type { PaymentRequest, PaymentResult } from '../types/payment.js';

export class TelegramStarsProvider implements PaymentProvider {
  async createPayment(_request: PaymentRequest): Promise<PaymentResult> {
    return {
      status: 'unavailable',
      provider: 'telegram_stars',
      message: 'Telegram Stars invoice flow будет подключён на следующем этапе.',
    };
  }
}
