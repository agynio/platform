import OpenAI from 'openai';

export type LLMProvider = 'openai' | 'litellm' | 'auto';

// Abstract base class for LLM provisioning lifecycle
export abstract class LLMProvisioner {
  // Lazily obtain a ready OpenAI-compatible client
  abstract getClient(): Promise<OpenAI>;
  // Ensure necessary keys/tokens are present or provisioned
  abstract ensureKeys(): Promise<void>;
  // Return keys used to create clients; may create/provision on demand
  abstract fetchOrCreateKeys(): Promise<{ apiKey: string; baseUrl?: string }>;
  // Refresh the underlying client/keys if needed
  abstract refresh(): Promise<void>;
  // Clean up any resources
  abstract dispose(): Promise<void>;
}
