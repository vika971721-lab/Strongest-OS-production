import type { ConversationStore } from './conversationState.js';
import { isConversationExpired } from './conversationState.js';
import type { ConversationState } from '../types/conversation.js';

export class InMemoryConversationStore implements ConversationStore {
  private readonly states = new Map<string, ConversationState>();

  async get(telegramId: string, nowMs = Date.now()): Promise<ConversationState | undefined> {
    const state = this.states.get(telegramId);
    if (!state) return undefined;
    if (isConversationExpired(state, nowMs)) {
      this.states.delete(telegramId);
      return undefined;
    }
    return state;
  }

  async set(telegramId: string, state: ConversationState): Promise<void> {
    this.states.set(telegramId, state);
  }

  async clear(telegramId: string): Promise<void> {
    this.states.delete(telegramId);
  }

  size(): number {
    return this.states.size;
  }
}
