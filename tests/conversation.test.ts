import { describe, expect, it } from 'vitest';
import { COUPON_STATE_TTL_MS } from '../src/config/constants.js';
import { createAwaitingCouponState } from '../src/state/conversationState.js';
import { InMemoryConversationStore } from '../src/state/inMemoryConversationStore.js';

describe('conversation store', () => {
  it('sets awaiting coupon state', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState(100));
    await expect(store.get('1', 100)).resolves.toEqual({ name: 'awaiting_coupon', startedAt: 100 });
  });

  it('clears cancelled state', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState(100));
    await store.clear('1');
    await expect(store.get('1', 100)).resolves.toBeUndefined();
  });

  it('expires state after 10 minutes', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState(100));
    await expect(store.get('1', 100 + COUPON_STATE_TTL_MS + 1)).resolves.toBeUndefined();
  });
});
