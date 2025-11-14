import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsUUID } from 'class-validator';
import { RunEventsService, SerializedContextItem } from '../events/run-events.service';

class ContextItemsQueryDto {
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => String(entry).split(','))
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
    }
    return [] as string[];
  })
  @IsUUID('4', { each: true })
  ids!: string[];
}

@Controller('api/agents/context-items')
export class ContextItemsController {
  constructor(@Inject(RunEventsService) private readonly runEvents: RunEventsService) {}

  @Get()
  async listContextItems(@Query() query: ContextItemsQueryDto): Promise<{ items: SerializedContextItem[] }> {
    const ids = Array.isArray(query.ids) ? query.ids : [];
    if (ids.length === 0) return { items: [] };
    const items = await this.runEvents.getContextItems(ids);
    return { items };
  }
}
