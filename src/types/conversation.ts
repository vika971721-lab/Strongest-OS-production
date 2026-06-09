export type ConversationStateName = 'awaiting_coupon';

export interface ConversationState {
  name: ConversationStateName;
  startedAt: number;
}
