import { Module } from '@nestjs/common';
import { LLMFactoryService } from './llmFactory.service';
import { ConversationStateRepository } from './repositories/conversationState.repository';
import { LoadLLMReducer } from './reducers/load.llm.reducer';
import { SaveLLMReducer } from './reducers/save.llm.reducer';
import { CallModelLLMReducer } from './reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from './reducers/callTools.llm.reducer';
import { EnforceToolsLLMReducer } from './reducers/enforceTools.llm.reducer';
import { SummarizationLLMReducer } from './reducers/summarization.llm.reducer';
import { StaticLLMRouter } from './routers/static.llm.router';
import { ConditionalLLMRouter } from './routers/conditional.llm.router';

@Module({
  providers: [
    LLMFactoryService,
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
  exports: [],
})
export class LLMModule {}

