import { Global, Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';
import { EnvModule } from '../env/env.module';
import { InfraModule } from '../infra/infra.module';
import { EventsModule } from '../events/events.module';
import { LLMModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';

import { LiveGraphRuntime } from './liveGraph.manager';
import { TemplateRegistry } from './templateRegistry';

@Global()
@Module({
  imports: [
    CoreModule,
    EnvModule,
    InfraModule,
    EventsModule,
    LLMModule,
    VaultModule,
  ],
  providers: [TemplateRegistry, LiveGraphRuntime],
  exports: [TemplateRegistry, LiveGraphRuntime],
})
export class GraphCoreModule {}
