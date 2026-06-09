import { describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '../src/payments/mockPaymentProvider.js';

describe('MockPaymentProvider', () => {
  it('returns unavailable mock result', async () => {
    const provider = new MockPaymentProvider();
    await expect(
      provider.createPayment({ telegramId: '1', amountStars: 100, description: 'test' }),
    ).resolves.toMatchObject({ status: 'unavailable', provider: 'mock' });
  });
});
