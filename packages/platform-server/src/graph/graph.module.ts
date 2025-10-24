import { Module } from '@nestjs/common';
import { TemplateRegistry } from './templateRegistry';
import { PortsRegistry } from './ports.registry';
import { GraphRepository } from './graph.repository';
import { MongoGraphRepository } from './graphMongo.repository';
import { GitGraphRepository } from './gitGraph.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { RunsController } from './controllers/runs.controller';
import { GraphPersistController } from './controllers/graphPersist.controller';
import { GraphController } from './controllers/graph.controller';
import { NodesModule } from '../nodes/nodes.module';
import { LLMModule } from '../llm/llm.module';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { AgentRunService } from '../nodes/agentRun.repository';
import { buildTemplateRegistry } from '../templates';
import { LoggerService } from '../core/services/logger.service';
import { ContainerService } from '../infra/container/container.service';
import { ConfigService } from '../core/services/config.service';
import { MongoService } from '../core/services/mongo.service';
import { LLMProvisioner } from '../llm/provisioners/llm.provisioner';
import { NcpsKeyService } from '../infra/ncps/ncpsKey.service';
import { GraphDefinition, GraphError } from './types';

@Module({
  imports: [CoreModule, InfraModule, NodesModule, LLMModule],
  controllers: [RunsController, GraphPersistController, GraphController],
  providers: [
    {
      provide: TemplateRegistry,
      useFactory: (
        logger: LoggerService,
        containerService: ContainerService,
        configService: ConfigService,
        mongoService: MongoService,
        provisioner: LLMProvisioner,
        ncpsKeyService: NcpsKeyService,
      ) =>
        buildTemplateRegistry({
          logger,
          containerService,
          configService,
          mongoService,
          provisioner,
          ncpsKeyService,
        }),
      inject: [LoggerService, ContainerService, ConfigService, MongoService, LLMProvisioner, NcpsKeyService],
    },
    PortsRegistry,
    {
      provide: GraphRepository,
      useFactory: async (
        config: ConfigService,
        logger: LoggerService,
        mongo: MongoService,
        templateRegistry: TemplateRegistry,
      ) => {
        if (config.graphStore === 'git') {
          const svc = new GitGraphRepository(config, logger, templateRegistry);
          await svc.initIfNeeded();
          return svc;
        } else {
          const svc = new MongoGraphRepository(mongo.getDb(), logger, templateRegistry, config);
          await svc.initIfNeeded();
          return svc;
        }
      },
      inject: [ConfigService, LoggerService, MongoService, TemplateRegistry],
    },
    {
      provide: LiveGraphRuntime,
      useFactory: async (
        logger: LoggerService,
        graphs: GraphRepository,
        templateRegistry: TemplateRegistry,
      ) => {
        const runtime = new LiveGraphRuntime(logger, templateRegistry, graphs);
        await runtime.load();
        return runtime;
      },
      inject: [LoggerService, GraphRepository, TemplateRegistry],
    },
    // Load and apply persisted graph to runtime at startup
    // {
    //   provide: 'LiveGraphRuntimeInitializer',
    //   useFactory: async (logger: LoggerService, graphs: GraphRepository, runtime: LiveGraphRuntime) => {
    //     const toRuntimeGraph = (saved: {
    //       nodes: Array<{
    //         id: string;
    //         template: string;
    //         config?: Record<string, unknown>;
    //         dynamicConfig?: Record<string, unknown>;
    //         state?: Record<string, unknown>;
    //       }>;
    //       edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string }>;
    //     }) =>
    //       ({
    //         nodes: saved.nodes.map((n) => ({
    //           id: n.id,
    //           data: { template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, state: n.state },
    //         })),
    //         edges: saved.edges.map((e) => ({
    //           source: e.source,
    //           sourceHandle: e.sourceHandle,
    //           target: e.target,
    //           targetHandle: e.targetHandle,
    //         })),
    //       }) as GraphDefinition;

    //     try {
    //       const existing = await graphs.get('main');
    //       if (existing) {
    //         logger.info(
    //           'Applying persisted graph to live runtime (version=%s, nodes=%d, edges=%d)',
    //           existing.version,
    //           existing.nodes.length,
    //           existing.edges.length,
    //         );
    //         await runtime.apply(toRuntimeGraph(existing));
    //         logger.info('Initial persisted graph applied successfully');
    //       } else {
    //         logger.info('No persisted graph found; starting with empty runtime graph.');
    //       }
    //     } catch (e) {
    //       if (e instanceof GraphError) {
    //         logger.error('Failed to apply initial persisted graph: %s. Cause: %s', e.message, (e as any)?.cause);
    //       }
    //       logger.error('Failed to apply initial persisted graph: %s', String(e));
    //     }
    //     return true;
    //   },
    //   inject: [LoggerService, GraphRepository, LiveGraphRuntime],
    // },
    AgentRunService,
  ],
  exports: [LiveGraphRuntime, TemplateRegistry, PortsRegistry, GraphRepository, AgentRunService],
})
export class GraphModule {}
