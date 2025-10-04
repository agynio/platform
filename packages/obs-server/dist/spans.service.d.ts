import { SpanDocument, ExtendedSpanRequest, SpanQuery, SpanResponse, SpanListResponse } from './types.js';
import { MongoService } from './mongo.js';
export declare class SpansService {
    private mongoService;
    private collection;
    constructor(mongoService: MongoService);
    upsertSpan(request: ExtendedSpanRequest): Promise<SpanDocument>;
    getSpan(traceId: string, spanId: string): Promise<SpanResponse | null>;
    querySpans(query: SpanQuery): Promise<SpanListResponse>;
    private documentToResponse;
}
