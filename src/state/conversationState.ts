import { COUPON_STATE_TTL_MS } from '../config/constants.js';
import type { ConversationState } from '../types/conversation.js';
import { isOlderThan } from '../utils/dates.js';

export interface ConversationStore {
  get(telegramId: string, nowMs?: number): Promise<ConversationState | undefined>;
  set(telegramId: string, state: ConversationState): Promise<void>;
  clear(telegramId: string): Promise<void>;
}

export const createAwaitingCouponState = (startedAt = Date.now()): ConversationState => ({
  name: 'awaiting_coupon',
  startedAt,
});

export const isConversationExpired = (state: ConversationState, nowMs = Date.now()): boolean =>
  isOlderThan(state.startedAt, COUPON_STATE_TTL_MS, nowMs);
