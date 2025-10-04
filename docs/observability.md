# Observability SDK and Server

This document provides setup instructions, API documentation, and examples for the custom observability solution designed for LLM/agent workflows.

## Overview

The observability system consists of:
- **@hautech/obs-sdk**: TypeScript SDK for instrumenting applications
- **@hautech/obs-server**: Backend service for collecting and storing span data
- **MongoDB**: Document storage with indexes optimized for span queries

## Quick Start

### 1. Start the Infrastructure

Start MongoDB and the observability server:

```bash
docker-compose -f docker-compose.obs.yml up -d
```

This will start:
- MongoDB on port 27017
- Observability server on port 3001

### 2. Install and Use the SDK

```typescript
import { observability } from '@hautech/obs-sdk';

// Initialize the SDK
observability.init({
  mode: 'extended',
  endpoint: 'http://localhost:3001',
  defaultAttributes: {
    environment: 'production',
    service: 'my-agent'
  }
});

// Use spans to track operations
await observability.withSpan(
  { 
    label: 'Agent: Process Request',
    attributes: { userId: 'user123' }
  },
  async () => {
    // Your agent/LLM logic here
    await doSomeWork();
  }
);
```

### 3. Query Span Data

```bash
# Get all running spans
curl "http://localhost:3001/v1/spans?running=true"

# Get spans with specific status
curl "http://localhost:3001/v1/spans?status=error"

# Get spans in time range
curl "http://localhost:3001/v1/spans?from=1640995200000&to=1641081600000"

# Get specific span
curl "http://localhost:3001/v1/spans/{traceId}/{spanId}"
```

## SDK API Reference

### Initialization

```typescript
observability.init(config: SDKConfig)
```

**SDKConfig:**
- `mode`: `'extended'` | `'otlp'` - Data collection mode
- `endpoint?`: string - Extended API endpoint 
- `otlpEndpoint?`: string - OTLP endpoint (for OTLP mode)
- `batchSize?`: number - Batch size for OTLP mode (default: 100)
- `batchTimeout?`: number - Batch timeout in ms (default: 5000)
- `maxRetries?`: number - Max retry attempts (default: 3)
- `retryBackoff?`: number - Retry backoff in ms (default: 1000)
- `defaultAttributes?`: SpanAttributes - Default span attributes

### Creating Spans

```typescript
await observability.withSpan(options: WithSpanOptions, fn: () => T | Promise<T>): Promise<T>
```

**WithSpanOptions:**
- `label`: string - Human-readable span description
- `attributes?`: SpanAttributes - Key-value attributes
- `nodeId?`: string - Optional node identifier
- `threadId?`: string - Optional thread identifier

**Example:**
```typescript
const result = await observability.withSpan(
  {
    label: 'LLM: Generate Response',
    attributes: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 1000
    },
    nodeId: 'llm-node-1',
    threadId: 'conversation-abc'
  },
  async () => {
    return await llm.generate(prompt);
  }
);
```

### Mode Differences

**Extended Mode (`mode: 'extended'`):**
- Spans are sent immediately when created
- Updates are sent while span is running  
- Completion is sent when span ends
- Provides real-time visibility into running operations

**OTLP Mode (`mode: 'otlp'`):**
- Spans are buffered and sent in batches
- Only completed spans are exported
- Compatible with standard OTLP collectors
- Lower network overhead

## Server API Reference

### Extended API Endpoints

#### Upsert Span
```
POST /v1/spans/upsert
Content-Type: application/json

{
  "state": "created" | "updated" | "completed",
  "traceId": "string",
  "spanId": "string", 
  "parentSpanId": "string?",
  "label": "string",
  "startTime": number?,
  "endTime": number?,
  "status": "running" | "ok" | "error" | "cancelled"?,
  "attributes": object?,
  "events": array?,
  "idempotencyKey": "string?",
  "rev": number?,
  "nodeId": "string?",
  "threadId": "string?"
}
```

#### Query Spans
```
GET /v1/spans?status=<status>&running=<bool>&from=<timestamp>&to=<timestamp>&label=<pattern>&cursor=<cursor>&limit=<number>&sort=<field>&order=<direction>
```

**Query Parameters:**
- `status`: Filter by span status (`running`, `ok`, `error`, `cancelled`)
- `running`: Filter by completion status (boolean)
- `from`, `to`: Time range filter (Unix timestamps)
- `label`: Label pattern filter (case-insensitive regex)
- `cursor`: Pagination cursor
- `limit`: Results per page (1-100, default 50)
- `sort`: Sort field (`lastUpdate`, `startTime`, default `lastUpdate`)
- `order`: Sort order (`asc`, `desc`, default `desc`)

#### Get Single Span
```
GET /v1/spans/{traceId}/{spanId}
```

### Health Endpoints

```
GET /healthz    # Basic health check
GET /readyz     # Readiness check (includes MongoDB connectivity)
```

### OTLP Endpoint

```
POST /v1/traces
Content-Type: application/x-protobuf

# Standard OTLP ExportTraceServiceRequest
```

## Data Model

### Span Document (MongoDB)

```typescript
{
  traceId: string,           // Trace identifier
  spanId: string,            // Span identifier  
  parentSpanId?: string,     // Parent span reference
  label: string,             // Human-readable description
  status: SpanStatus,        // Current status
  startTime: number,         // Start timestamp (Unix ms)
  endTime?: number,          // End timestamp (Unix ms)
  completed: boolean,        // Completion flag
  lastUpdate: number,        // Last update timestamp
  attributes?: object,       // Key-value attributes
  events?: array,            // Timeline events
  rev: number,               // Revision counter
  idempotencyKeys: string[], // Deduplication keys
  createdAt: Date,           // Creation time
  updatedAt: Date,           // Last modification time
  nodeId?: string,           // Optional node ID (not indexed)
  threadId?: string          // Optional thread ID (not indexed)
}
```

### Database Indexes

- **Unique**: `{ traceId: 1, spanId: 1 }`
- **Query**: `{ status: 1, lastUpdate: -1 }`
- **Time**: `{ startTime: -1 }`
- **Running**: `{ completed: 1, lastUpdate: -1 }` (partial)
- **TTL**: `{ updatedAt: 1 }` (30 days retention)

## Configuration

### Server Environment Variables

```bash
PORT=3001                    # Server port
MONGO_URL=mongodb://...      # MongoDB connection string
LOG_LEVEL=info              # Logging level (debug|info|warn|error)
CORS_ENABLED=true           # Enable CORS
```

### SDK Configuration Examples

**Development:**
```typescript
observability.init({
  mode: 'extended',
  endpoint: 'http://localhost:3001',
  maxRetries: 1,
  retryBackoff: 500
});
```

**Production:**
```typescript
observability.init({
  mode: 'extended', 
  endpoint: 'https://observability.mycompany.com',
  maxRetries: 3,
  retryBackoff: 2000,
  defaultAttributes: {
    environment: 'production',
    service: process.env.SERVICE_NAME,
    version: process.env.VERSION
  }
});
```

## Examples

### Basic Agent Instrumentation

```typescript
import { observability } from '@hautech/obs-sdk';

class Agent {
  async processRequest(userInput: string) {
    return await observability.withSpan(
      {
        label: 'Agent: Process User Request',
        attributes: { 
          inputLength: userInput.length,
          userId: 'user123'
        }
      },
      async () => {
        // Step 1: Analyze input
        const intent = await observability.withSpan(
          { label: 'LLM: Analyze Intent' },
          () => this.analyzeIntent(userInput)
        );

        // Step 2: Execute tools
        const toolResults = await observability.withSpan(
          { 
            label: 'Tools: Execute Actions',
            attributes: { toolCount: intent.tools.length }
          },
          () => this.executeTools(intent.tools)
        );

        // Step 3: Generate response
        return await observability.withSpan(
          { label: 'LLM: Generate Response' },
          () => this.generateResponse(intent, toolResults)
        );
      }
    );
  }
}
```

### Error Handling

```typescript
await observability.withSpan(
  { label: 'Risky Operation' },
  async () => {
    try {
      return await riskyApiCall();
    } catch (error) {
      // Span will automatically be marked as 'error'
      // Add context to help with debugging
      const currentSpan = observability.getCurrentSpan();
      if (currentSpan) {
        currentSpan.setAttributes({
          errorType: error.constructor.name,
          errorMessage: error.message,
          retryCount: 3
        });
      }
      throw error;
    }
  }
);
```

### Nested Operations

```typescript
await observability.withSpan(
  { label: 'Multi-Step Workflow' },
  async () => {
    const results = [];
    
    for (let i = 0; i < items.length; i++) {
      const result = await observability.withSpan(
        { 
          label: `Process Item ${i + 1}`,
          attributes: { itemId: items[i].id }
        },
        () => processItem(items[i])
      );
      results.push(result);
    }
    
    return results;
  }
);
```

## Troubleshooting

### Common Issues

**SDK not sending data:**
1. Check initialization: Ensure `observability.init()` is called
2. Verify endpoint: Confirm server is running and accessible
3. Check network: Look for connectivity issues or firewall rules
4. Review logs: SDK logs errors to console by default

**Server connection issues:**
1. Verify MongoDB: Check `GET /readyz` endpoint
2. Check configuration: Ensure `MONGO_URL` is correct
3. Review server logs: Look for startup errors or connection failures

**Missing spans:**
1. Check span creation: Ensure `withSpan()` calls complete successfully
2. Verify filters: Query parameters might be too restrictive
3. Check time range: Spans might be outside the queried time window
4. Review TTL: Old spans are automatically deleted after 30 days

### Performance Considerations

**SDK:**
- Extended mode: Higher network usage, real-time visibility
- OTLP mode: Lower network usage, batched sending
- Use `defaultAttributes` to avoid repetitive span attributes
- Consider retry configuration for unreliable networks

**Server:**
- MongoDB indexes are optimized for common query patterns
- Use cursor-based pagination for large result sets
- Consider connection pooling for high-throughput scenarios
- Monitor MongoDB performance and scale as needed

### Development Tips

1. **Use the demo**: Run `examples/observability-demo` to see the system in action
2. **Start local**: Use docker-compose for local development
3. **Check health**: Monitor `/healthz` and `/readyz` endpoints
4. **Review data**: Use MongoDB Compass or CLI to inspect stored spans
5. **Test errors**: Verify error scenarios are properly captured

## Migration and Integration

### From Traceloop/Jaeger

Key differences:
- **Extended mode**: Immediate span visibility vs. batch export
- **Data model**: MongoDB documents vs. Jaeger spans  
- **Queries**: REST API vs. Jaeger Query API
- **Retention**: TTL-based vs. manual cleanup

Migration steps:
1. Deploy observability server alongside existing infrastructure
2. Update applications to use `@hautech/obs-sdk`
3. Gradually shift monitoring to new system
4. Retire Traceloop/Jaeger when confident in new system

### Integration Patterns

**Service Mesh:**
```typescript
// Automatic trace propagation
const traceId = extractTraceFromHeaders(request.headers);
if (traceId) {
  observability.setTraceId(traceId);
}
```

**Message Queues:**
```typescript
// Trace across async boundaries
const spanContext = observability.getCurrentContext();
await queue.send({
  ...message,
  traceContext: spanContext?.serialize()
});
```

**Microservices:**
```typescript
// Cross-service spans
await observability.withSpan(
  { 
    label: 'Service: Call User API',
    attributes: { 
      targetService: 'user-service',
      method: 'GET',
      path: '/users/123'
    }
  },
  () => userService.getUser('123')
);
```

This observability solution provides comprehensive monitoring for LLM/agent workflows with minimal overhead and maximum visibility into running operations.