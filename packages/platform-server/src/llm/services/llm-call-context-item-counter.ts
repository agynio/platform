import { LLMCallContextItemPurpose } from '@prisma/client';
import type { RunEventsService } from '../../events/run-events.service';

type CounterInit = {
  eventId?: string | null;
  count?: number;
  ids?: string[];
};

export class LLMCallContextItemCounter {
  private eventId: string | null;
  private total: number;
  private readonly ids: Set<string>;
  private pendingTailIds: string[] = [];
  private pendingTailLookup: Set<string> = new Set();

  constructor(private readonly runEvents: RunEventsService, init?: CounterInit) {
    this.eventId = init?.eventId ?? null;
    this.total = init?.count ?? 0;
    this.ids = new Set();
    if (Array.isArray(init?.ids)) {
      for (const id of init.ids) {
        if (typeof id !== 'string' || id.length === 0) continue;
        this.ids.add(id);
      }
    }
  }

  get value(): number {
    return this.total;
  }

  async bind(eventId: string): Promise<void> {
    this.eventId = eventId;
    await this.persist();
  }

  async increment(amount: number, ids?: string[]): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.total += amount;
    if (Array.isArray(ids) && ids.length > 0) {
      const newIds: string[] = [];
      for (const id of ids) {
        if (typeof id !== 'string' || id.length === 0) continue;
        if (this.ids.has(id)) continue;
        this.ids.add(id);
        newIds.push(id);
      }
      for (const id of newIds) {
        if (this.pendingTailLookup.has(id)) continue;
        this.pendingTailIds.push(id);
        this.pendingTailLookup.add(id);
      }
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.eventId) return;
    await this.runEvents.updateLLMCallNewContextItemCount({
      eventId: this.eventId,
      newContextItemCount: this.total,
      newContextItemIds: Array.from(this.ids),
    });
    if (this.pendingTailIds.length > 0) {
      const tailIds = [...this.pendingTailIds];
      const createdAt = new Date();
      await this.runEvents.appendLLMCallContextItems({
        eventId: this.eventId,
        items: tailIds.map((contextItemId) => ({
          contextItemId,
          purpose: LLMCallContextItemPurpose.produced_tail,
          isNew: true,
          createdAt,
        })),
      });
      this.pendingTailIds = [];
      this.pendingTailLookup = new Set();
    }
  }
}
