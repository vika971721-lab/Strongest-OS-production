import type { ConversationStore } from './conversationState.js';
import { isConversationExpired } from './conversationState.js';
import type { ConversationState } from '../types/conversation.js';

export class InMemoryConversationStore implements ConversationStore {
  private readonly states = new Map<string, ConversationState>();

  get(telegramId: string, nowMs = Date.now()): Promise<ConversationState | undefined> {
    const state = this.states.get(telegramId);
    if (!state) return Promise.resolve(undefined);
    if (isConversationExpired(state, nowMs)) {
      this.states.delete(telegramId);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(state);
  }

  set(telegramId: string, state: ConversationState): Promise<void> {
    this.states.set(telegramId, state);
    return Promise.resolve();
  }

  clear(telegramId: string): Promise<void> {
    this.states.delete(telegramId);
    return Promise.resolve();
  }

  size(): number {
    return this.states.size;
  }
}
