import { describe, expect, it } from 'vitest';
import { ContextItemRole } from '@prisma/client';
import { DeveloperMessage } from '@agyn/llm';
import {
  coerceContextItemRole,
  contextItemInputFromMessage,
  contextItemInputFromDeveloper,
} from '../src/llm/services/context-items.utils';

describe('context-items utilities developer role support', () => {
  it('aliases developer role to system context role', () => {
    expect(coerceContextItemRole('developer')).toBe(ContextItemRole.system);
  });

  it('maps developer message to system context item input', () => {
    const message = DeveloperMessage.fromText('instruction');
    const input = contextItemInputFromMessage(message);

    expect(input.role).toBe(ContextItemRole.system);
    expect(input.contentText).toBe('instruction');
    expect(input.metadata).toMatchObject({ type: 'message' });

    const direct = contextItemInputFromDeveloper(message);
    expect(direct.role).toBe(ContextItemRole.system);
    expect(direct.contentText).toBe('instruction');
  });
});
