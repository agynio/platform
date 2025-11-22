import { Global, Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module';

import { LiveGraphRuntime } from './liveGraph.manager';
import { TemplateRegistry } from './templateRegistry';

@Global()
@Module({
  imports: [CoreModule],
  providers: [TemplateRegistry, LiveGraphRuntime],
  exports: [TemplateRegistry, LiveGraphRuntime],
})
export class GraphCoreModule {}
