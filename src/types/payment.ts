export type PaymentProviderName = 'mock' | 'telegram_stars';
export type PaymentStatus = 'unavailable' | 'pending' | 'paid' | 'failed';

export interface PaymentRequest {
  telegramId: string;
  amountStars: number;
  description: string;
}

export interface PaymentResult {
  status: PaymentStatus;
  provider: PaymentProviderName;
  message: string;
}
