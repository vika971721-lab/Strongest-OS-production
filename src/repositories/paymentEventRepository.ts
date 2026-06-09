export interface PaymentEventRepository {
  recordEvent(eventName: string): Promise<{ status: 'not_configured' }>;
}
