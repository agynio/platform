import { Module } from '@nestjs/common';
import { TemplateRegistry } from './templateRegistry';
import { PortsRegistry } from './ports.registry';
import { GraphService } from './graphMongo.repository';
import { GitGraphService } from './gitGraph.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { enforceMcpCommandMutationGuard } from './graph.guard';
import { EnvService } from './env.service';

@Module({
  providers: [
    TemplateRegistry,
    PortsRegistry,
    GraphService,
    GitGraphService,
    LiveGraphRuntime,
    EnvService,
    // Guards (functions are not providers; list here for visibility if later wrapped)
    // enforceMcpCommandMutationGuard is a pure function and intentionally not registered
  ],
  exports: [EnvService],
})
export class GraphModule {}
