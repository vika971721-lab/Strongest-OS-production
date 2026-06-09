import type { PaymentProvider } from '../payments/paymentProvider.js';
import type { PaymentRequest, PaymentResult } from '../types/payment.js';

export interface PaymentService {
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
}

export class DefaultPaymentService implements PaymentService {
  constructor(private readonly provider: PaymentProvider) {}

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return this.provider.createPayment(request);
  }
}
