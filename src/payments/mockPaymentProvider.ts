import type { PaymentProvider } from './paymentProvider.js';
import type { PaymentRequest, PaymentResult } from '../types/payment.js';

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(_request: PaymentRequest): Promise<PaymentResult> {
    return {
      status: 'unavailable',
      provider: 'mock',
      message: 'Тестовый режим оплаты активен. Реальные платежи пока не подключены.',
    };
  }
}
