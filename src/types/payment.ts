export type PaymentProviderName = 'mock' | 'telegram_stars';
export type PaymentStatus = 'unavailable' | 'pending' | 'paid' | 'failed';
export type PaymentPlan = 'first_month' | 'monthly_renewal';
export type PaymentOrderStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired';
export type PaymentEventType =
  | 'successful_payment'
  | 'first_month_race_converted_to_renewal'
  | 'admin_extension';

export interface PaymentRequest {
  telegramId: string;
  amountStars: number;
  description: string;
}

export interface PaymentResult {
  status: PaymentStatus;
  provider: PaymentProviderName;
  paymentUrl?: string;
  message: string;
}

export interface PaymentOrder {
  id?: string;
  orderId: string;
  telegramId: string;
  supabaseUserId?: string;
  provider: 'telegram_stars';
  providerInvoicePayload: string;
  plan: PaymentPlan;
  amount: number;
  currency: 'XTR';
  periodDays: number;
  status: PaymentOrderStatus;
  providerPaymentId?: string;
  createdAt: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  rawPayload?: SanitizedPaymentPayload;
}

export interface CreatePaymentOrderInput {
  telegramId: string;
  supabaseUserId?: string;
  plan: PaymentPlan;
  amount: number;
  periodDays: number;
  now?: Date;
}

export interface PaymentEvent {
  id?: string;
  provider: 'telegram_stars';
  providerEventId: string;
  orderId: string;
  telegramId: string;
  supabaseUserId?: string;
  eventType: PaymentEventType;
  amount: number;
  currency: 'XTR';
  plan: PaymentPlan;
  periodDays: number;
  rawPayload: SanitizedPaymentPayload;
  processedAt?: Date;
  createdAt: Date;
}

export interface CreatePaymentEventInput {
  providerEventId: string;
  orderId: string;
  telegramId: string;
  supabaseUserId?: string;
  eventType: PaymentEventType;
  amount: number;
  currency: 'XTR';
  plan: PaymentPlan;
  periodDays: number;
  rawPayload: SanitizedPaymentPayload;
  now?: Date;
}

export interface SanitizedPaymentPayload {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id?: string;
  provider_payment_charge_id?: string;
  message_id?: number;
  update_id?: number;
  timestamp: string;
}
