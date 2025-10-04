import { Collection, Filter } from 'mongodb';
import { 
  SpanDocument, 
  ExtendedSpanRequest, 
  SpanQuery, 
  SpanResponse, 
  SpanListResponse 
} from './types.js';
import { MongoService } from './mongo.js';

export class SpansService {
  private collection: Collection<SpanDocument>;

  constructor(private mongoService: MongoService) {
    this.collection = mongoService.getSpansCollection();
  }

  async upsertSpan(request: ExtendedSpanRequest): Promise<SpanDocument> {
    const now = new Date();
    const timestamp = Date.now();

    // Check for idempotency
    if (request.idempotencyKey) {
      const existing = await this.collection.findOne({
        traceId: request.traceId,
        spanId: request.spanId,
        idempotencyKeys: request.idempotencyKey,
      });

      if (existing) {
        return existing;
      }
    }

    const filter = {
      traceId: request.traceId,
      spanId: request.spanId,
    };

    const existingSpan = await this.collection.findOne(filter);

    if (request.state === 'created') {
      if (existingSpan) {
        throw new Error('Span already exists');
      }

      if (!request.label) {
        throw new Error('Label is required for span creation');
      }

      const document: SpanDocument = {
        traceId: request.traceId,
        spanId: request.spanId,
        parentSpanId: request.parentSpanId,
        label: request.label,
        status: request.status || 'running',
        startTime: request.startTime || timestamp,
        completed: false,
        lastUpdate: timestamp,
        attributes: request.attributes,
        events: request.events || [],
        rev: request.rev || 0,
        idempotencyKeys: request.idempotencyKey ? [request.idempotencyKey] : [],
        createdAt: now,
        updatedAt: now,
        nodeId: request.nodeId,
        threadId: request.threadId,
      };

      await this.collection.insertOne(document);
      return document;
    }

    if (!existingSpan) {
      throw new Error('Span not found');
    }

    // Prepare update
    const updateDoc: Partial<SpanDocument> = {
      lastUpdate: timestamp,
      updatedAt: now,
    };

    if (request.status) {
      updateDoc.status = request.status;
    }

    if (request.attributes) {
      updateDoc.attributes = { ...existingSpan.attributes, ...request.attributes };
    }

    if (request.events) {
      updateDoc.events = [...(existingSpan.events || []), ...request.events];
    }

    if (request.state === 'completed') {
      updateDoc.completed = true;
      updateDoc.endTime = request.endTime || timestamp;
    }

    if (request.rev !== undefined) {
      updateDoc.rev = request.rev;
    }

    // Add idempotency key if provided
    const idempotencyKeys = request.idempotencyKey 
      ? [...existingSpan.idempotencyKeys, request.idempotencyKey]
      : existingSpan.idempotencyKeys;

    const result = await this.collection.findOneAndUpdate(
      filter,
      {
        $set: updateDoc,
        $addToSet: request.idempotencyKey ? { idempotencyKeys: request.idempotencyKey } : {},
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new Error('Failed to update span');
    }

    return result;
  }

  async getSpan(traceId: string, spanId: string): Promise<SpanResponse | null> {
    const document = await this.collection.findOne({
      traceId,
      spanId,
    });

    if (!document) {
      return null;
    }

    return this.documentToResponse(document);
  }

  async querySpans(query: SpanQuery): Promise<SpanListResponse> {
    const filter: Filter<SpanDocument> = {};
    
    // Build filter
    if (query.status) {
      filter.status = query.status;
    }

    if (query.running !== undefined) {
      filter.completed = !query.running;
    }

    if (query.from || query.to) {
      const timeFilter: any = {};
      if (query.from) timeFilter.$gte = query.from;
      if (query.to) timeFilter.$lte = query.to;
      filter.startTime = timeFilter;
    }

    if (query.label) {
      filter.label = { $regex: query.label, $options: 'i' };
    }

    // Handle cursor-based pagination
    if (query.cursor) {
      try {
        const cursorData = JSON.parse(Buffer.from(query.cursor, 'base64').toString());
        if (query.sort === 'lastUpdate') {
          filter.lastUpdate = query.order === 'desc' 
            ? { $lt: cursorData.lastUpdate }
            : { $gt: cursorData.lastUpdate };
        } else {
          filter.startTime = query.order === 'desc' 
            ? { $lt: cursorData.startTime }
            : { $gt: cursorData.startTime };
        }
      } catch {
        // Invalid cursor, ignore
      }
    }

    // Build sort
    const sort: { [key: string]: 1 | -1 } = {};
    if (query.sort === 'lastUpdate') {
      sort.lastUpdate = query.order === 'desc' ? -1 : 1;
    } else {
      sort.startTime = query.order === 'desc' ? -1 : 1;
    }

    // Execute query with limit + 1 to check for more results
    const documents = await this.collection
      .find(filter)
      .sort(sort)
      .limit(query.limit + 1)
      .toArray();

    const hasMore = documents.length > query.limit;
    const results = hasMore ? documents.slice(0, query.limit) : documents;

    // Generate next cursor
    let nextCursor: string | undefined;
    if (hasMore && results.length > 0) {
      const lastResult = results[results.length - 1];
      const cursorData = query.sort === 'lastUpdate'
        ? { lastUpdate: lastResult.lastUpdate }
        : { startTime: lastResult.startTime };
      nextCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    }

    return {
      spans: results.map(doc => this.documentToResponse(doc)),
      pagination: {
        hasMore,
        nextCursor,
      },
    };
  }

  private documentToResponse(document: SpanDocument): SpanResponse {
    const { idempotencyKeys, createdAt, updatedAt, ...response } = document;
    return response;
  }
}