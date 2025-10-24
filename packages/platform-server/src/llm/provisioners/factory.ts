import { ConfigService } from '../../core/services/config.service';
import { LoggerService } from '../../core/services/logger.service';
import { LLMProvider, LLMProvisioner } from './types';
import { LiteLLMProvisioner } from './litellm.provisioner';
import { OpenAILLMProvisioner } from './openai.provisioner';

export class LLMProvisionerFactory {
  constructor(private cfg: ConfigService, private logger: LoggerService) {}

  getProvisioner(): LLMProvisioner {
    const provider: LLMProvider = (this.cfg.llmProvider || 'auto') as LLMProvider;
    if (provider === 'openai') return new OpenAILLMProvisioner(this.cfg);
    if (provider === 'litellm') return new LiteLLMProvisioner(this.cfg, this.logger);
    // auto: prefer direct OpenAI if key present; otherwise LiteLLM
    if (this.cfg.openaiApiKey) return new OpenAILLMProvisioner(this.cfg);
    return new LiteLLMProvisioner(this.cfg, this.logger);
  }
}

