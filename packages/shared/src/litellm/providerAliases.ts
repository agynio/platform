const LITELLM_PROVIDER_ALIASES: Record<string, string> = {
  azure_openai: 'azure',
  'azure-openai': 'azure',
  azureopenai: 'azure',
  azure_openai_chat: 'azure',
  azure_openai_completion: 'azure',
  azure_openai_responses: 'azure',
  azure_openai_embeddings: 'azure',
  azure_ai_studio: 'azure_ai',
  'azure-ai-studio': 'azure_ai',
  azure_ai_foundry: 'azure_ai',
  'azure-ai-foundry': 'azure_ai',
  azure_ad: 'azure',
  'azure-ad': 'azure',
  openai_chat: 'openai',
  openai_chat_completion: 'openai',
  openai_chatcompletions: 'openai',
  openai_text: 'text-completion-openai',
  openai_text_completion: 'text-completion-openai',
  text_completion_openai: 'text-completion-openai',
  'text-completion-openai': 'text-completion-openai',
};

export function normalizeLiteLLMProvider(provider?: string | null): string | undefined {
  if (!provider) return undefined;
  const trimmed = provider.trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase();
  const alias = LITELLM_PROVIDER_ALIASES[key];
  if (alias) {
    return alias;
  }
  return trimmed;
}

export function resolveLiteLLMProviderOrThrow(provider?: string | null): string {
  const normalized = normalizeLiteLLMProvider(provider);
  if (!normalized) {
    throw new Error('LiteLLM provider cannot be empty');
  }
  return normalized;
}

