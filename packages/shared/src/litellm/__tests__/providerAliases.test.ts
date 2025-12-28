import { describe, expect, it } from 'vitest';

import { normalizeLiteLLMProvider } from '../providerAliases';

describe('normalizeLiteLLMProvider', () => {
  it('returns canonical provider for azure aliases', () => {
    expect(normalizeLiteLLMProvider('azure_openai')).toBe('azure');
    expect(normalizeLiteLLMProvider('Azure-OpenAI')).toBe('azure');
  });

  it('returns canonical provider for openai aliases', () => {
    expect(normalizeLiteLLMProvider('openai_chat')).toBe('openai');
    expect(normalizeLiteLLMProvider('OPENAI_TEXT')).toBe('text-completion-openai');
  });

  it('trims whitespace and preserves canonical values', () => {
    expect(normalizeLiteLLMProvider(' azure ')).toBe('azure');
  });

  it('returns undefined for empty values', () => {
    expect(normalizeLiteLLMProvider('')).toBeUndefined();
    expect(normalizeLiteLLMProvider(undefined)).toBeUndefined();
  });
});

