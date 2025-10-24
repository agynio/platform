import { Module } from '@nestjs/common';
import { LLMProvisioner } from './llm.provisioner';
import { ConversationStateRepository } from './repositories/conversationState.repository';
import { LoadLLMReducer } from './reducers/load.llm.reducer';
import { SaveLLMReducer } from './reducers/save.llm.reducer';
import { CallModelLLMReducer } from './reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from './reducers/callTools.llm.reducer';
import { EnforceToolsLLMReducer } from './reducers/enforceTools.llm.reducer';
import { SummarizationLLMReducer } from './reducers/summarization.llm.reducer';
import { StaticLLMRouter } from './routers/static.llm.router';
import { ConditionalLLMRouter } from './routers/conditional.llm.router';
import { LLMProvisioner } from './provisioners/llm.provisioner';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { LiteLLMProvisioner } from './provisioners/litellm.provisioner';
import { OpenAILLMProvisioner } from './provisioners/openai.provisioner';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { OpenAILLMProvisioner } from './provisioners/openai.provisioner';
import { LiteLLMProvisioner } from './provisioners/litellm.provisioner';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { LiteLLMProvisioner } from './provisioners/litellm.provisioner';
import { OpenAILLMProvisioner } from './provisioners/openai.provisioner';

@Module({
<<<<<<< HEAD
  imports: [CoreModule],
=======
  imports: [],
>>>>>>> 6999373 (merge: resolve conflicts per new LLMProvisioner design (lazy getLLM, llm.module provider), remove factory service, no startup provisioning)
  providers: [
    {
      provide: LLMProvisioner,
      useFactory: (cfg: ConfigService, logger: LoggerService) =>
        cfg.llmProvider === 'litellm' ? new LiteLLMProvisioner(cfg, logger) : new OpenAILLMProvisioner(cfg),
      useFactory: (cfg: ConfigService, logger: LoggerService) => {
        const provider = (cfg.llmProvider || 'auto') as 'openai' | 'litellm' | 'auto';
        if (provider === 'openai') return new OpenAILLMProvisioner(cfg);
        if (provider === 'litellm') return new LiteLLMProvisioner(cfg, logger);
        // auto: prefer direct OpenAI if key present; otherwise LiteLLM
        if (cfg.openaiApiKey) return new OpenAILLMProvisioner(cfg);
        return new LiteLLMProvisioner(cfg, logger);
      },
      inject: [ConfigService, LoggerService],
    },
      useFactory: (cfg: ConfigService, logger: LoggerService) => {
        const provider = (cfg.llmProvider or 'auto')
        
        return new LiteLLMProvisioner(cfg, logger)
      },
      inject: [ConfigService, LoggerService],
    },
    ConversationStateRepository,
    LoadLLMReducer,
    SaveLLMReducer,
    CallModelLLMReducer,
    CallToolsLLMReducer,
    EnforceToolsLLMReducer,
    SummarizationLLMReducer,
    StaticLLMRouter,
    ConditionalLLMRouter,
  ],
  exports: [LLMProvisioner],
  exports: [LLMProvisioner],
})
export class LLMModule {}
