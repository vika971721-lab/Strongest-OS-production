import type { PaymentRequest, PaymentResult } from '../types/payment.js';

export interface PaymentProvider {
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
}
