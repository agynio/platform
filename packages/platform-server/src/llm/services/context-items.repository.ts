import type { Prisma, PrismaClient } from '@prisma/client';
import type { LoggerLike, NormalizedContextItem } from './context-items.utils';
import { sanitizeContextItemPayload } from './context-items.utils';

type ContextItemClient = PrismaClient | Prisma.TransactionClient;

export class ContextItemsRepository {
  constructor(private readonly client: ContextItemClient, private readonly logger?: LoggerLike) {}

  private get delegate() {
    return this.client.contextItem;
  }

  async create(args: Prisma.ContextItemCreateArgs) {
    const sanitizedData = sanitizeContextItemPayload(args.data, this.logger);
    return this.delegate.create({ ...args, data: sanitizedData });
  }

  async update(args: Prisma.ContextItemUpdateArgs) {
    const sanitizedData = sanitizeContextItemPayload(args.data, this.logger);
    return this.delegate.update({ ...args, data: sanitizedData });
  }

  async findMany<T extends Prisma.ContextItemFindManyArgs>(args: T): Promise<Array<Prisma.ContextItemGetPayload<T>>> {
    return this.delegate.findMany(args as Prisma.ContextItemFindManyArgs) as Promise<Array<Prisma.ContextItemGetPayload<T>>>;
  }

  async createNormalized(item: NormalizedContextItem): Promise<string> {
    const record = await this.create({
      data: {
        role: item.role,
        contentText: item.contentText,
        contentJson: item.contentJson,
        metadata: item.metadata,
        sizeBytes: item.sizeBytes,
      },
      select: { id: true },
    });
    return record.id;
  }
}

export async function upsertNormalizedContextItems(
  client: ContextItemClient,
  items: NormalizedContextItem[],
  logger?: LoggerLike,
): Promise<{ ids: string[]; created: number }> {
  const repository = new ContextItemsRepository(client, logger);
  const ids: string[] = [];
  for (const item of items) {
    const id = await repository.createNormalized(item);
    ids.push(id);
  }
  return { ids, created: ids.length };
}
