import { describe, expect, it } from 'vitest';
import { DeveloperMessage, SystemMessage } from '@agyn/llm';
import { PersistenceBaseLLMReducer } from '../src/llm/reducers/persistenceBase.llm.reducer';
import type { JsonValue } from '../src/llm/services/messages.serialization';
import type { LLMContext, LLMState } from '../src/llm/types';

class TestPersistenceReducer extends PersistenceBaseLLMReducer {
  async invoke(state: LLMState, _ctx: LLMContext): Promise<LLMState> {
    return state;
  }

  serializePublic(state: LLMState) {
    return this.serializeState(state);
  }

  deserializePublic(value: JsonValue) {
    return this.deserializeState(value);
  }
}

describe('PersistenceBaseLLMReducer developer role handling', () => {
  it('serializes system messages with developer role output', () => {
    const reducer = new TestPersistenceReducer();
    const state: LLMState = {
      messages: [DeveloperMessage.fromText('Persist developer role.')],
      summary: undefined,
      context: { messageIds: [], memory: [], system: { id: null, role: 'developer' } },
    };

    const plain = reducer.serializePublic(state);

    expect(plain.messages).toHaveLength(1);
    const [message] = plain.messages;
    expect(message.kind).toBe('developer');
    expect(message.value).not.toBeNull();

    const stored = message.value as { role: string };
    expect(stored.role).toBe('developer');
    expect(plain.context.system?.role).toBe('developer');
  });

  it('deserializes persisted developer role messages', () => {
    const reducer = new TestPersistenceReducer();
    const persisted = {
      messages: [
        {
          kind: 'system',
          value: {
            type: 'message',
            role: 'developer',
            content: [{ type: 'input_text', text: 'Persisted developer instruction' }],
          },
        },
      ],
      context: { messageIds: [], memory: [] },
    } satisfies Record<string, unknown>;

    const state = reducer.deserializePublic(persisted as JsonValue);

    expect(state.messages).toHaveLength(1);
    const [message] = state.messages;
    expect(message).toBeInstanceOf(DeveloperMessage);
    expect(message.toPlain().role).toBe('developer');
  });

  it('deserializes legacy system role messages', () => {
    const reducer = new TestPersistenceReducer();
    const persisted = {
      messages: [
        {
          kind: 'system',
          value: {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text: 'Legacy system instruction' }],
          },
        },
      ],
      context: { messageIds: [], memory: [] },
    } satisfies Record<string, unknown>;

    const state = reducer.deserializePublic(persisted as JsonValue);

    expect(state.messages).toHaveLength(1);
    const [message] = state.messages;
    expect(message).toBeInstanceOf(SystemMessage);
    expect(message.toPlain().role).toBe('system');
  });
});
