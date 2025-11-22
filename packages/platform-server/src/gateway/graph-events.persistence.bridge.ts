import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AgentsPersistenceService } from '../agents/agents.persistence.service';
import { GraphEventsPublisher } from '../graph/events/graph.events.publisher';

@Injectable()
export class GraphEventsPersistenceBridge implements OnModuleInit {
  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(GraphEventsPublisher) private readonly publisher: GraphEventsPublisher,
  ) {}

  onModuleInit(): void {
    this.persistence.setEventsPublisher(this.publisher);
  }
}
