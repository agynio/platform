import { Module } from '@nestjs/common';
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
import { LiteLLMProvisioner } from './provisioners/litellm.provisioner';
import { OpenAILLMProvisioner } from './provisioners/openai.provisioner';
import { CoreModule } from '../core/core.module';
import { EventsModule } from '../events/events.module';
import { LiteLLMKeyStore } from './provisioners/litellm.key.store';

@Module({
  imports: [CoreModule, EventsModule],
  providers: [
    LiteLLMKeyStore,
    LiteLLMProvisioner,
    OpenAILLMProvisioner,
    {
      provide: LLMProvisioner,
      useFactory: async (
        cfg: ConfigService,
        liteProvisioner: LiteLLMProvisioner,
        openaiProvisioner: OpenAILLMProvisioner,
      ) => {
        if (cfg.llmProvider === 'openai') {
          return openaiProvisioner;
        }
        await liteProvisioner.init();
        return liteProvisioner;
      },
      inject: [ConfigService, LiteLLMProvisioner, OpenAILLMProvisioner],
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
  exports: [LLMProvisioner, LiteLLMProvisioner, LiteLLMKeyStore],
})
export class LLMModule {}
