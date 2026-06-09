import type { PaymentRequest, PaymentResult } from '../types/payment.js';

export interface PaymentOrderRepository {
  createOrder(request: PaymentRequest): Promise<{ status: 'not_configured' }>;
  markResult(result: PaymentResult): Promise<{ status: 'not_configured' }>;
}
