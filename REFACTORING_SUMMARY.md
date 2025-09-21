# MCP Lifecycle Refactoring Summary

## Problem Statement
The original MCP server lifecycle had issues:
- LocalMCPServer created one container during startup with "default" thread (not desired)
- Expected behavior: container per thread (similar to bashTool)
- MCP doesn't have predefined tools with schemas; at least one running instance is required to fetch available tools

## Solution Implemented

### New Lifecycle Flow
1. **Tool Discovery Phase**: During MCP server creation, start temporary server and fetch available tools
2. **Container Cleanup**: Stop initial/temporary container 
3. **Tool Registration**: Register discovered tools in the agent
4. **Lazy Provisioning**: Do lazy container provisioning when tool is called (similar to bash tool)

### Key Changes Made

#### 1. LocalMCPServer Refactoring (`src/mcp/localMcpServer.ts`)
- Added `discoverTools()` method for initial tool discovery using temporary containers
- Modified `start()` to use cached tools from discovery phase
- Updated `callTool()` to use thread-specific containers with lazy provisioning
- Removed persistent client/transport - now created per tool call
- Added `toolsDiscovered` flag to track discovery state
- Updated `listTools()` to use cached tools

#### 2. Interface Updates (`src/mcp/types.ts`)
- Added `threadId?: string` option to `McpServer.callTool()` method signature

#### 3. Agent Integration (`src/agents/simple.agent.ts`) 
- Updated MCP tool creation to pass `threadId` from LangGraph config to MCP server
- Tools now use `config?.configurable?.thread_id` for thread-specific execution

#### 4. Template Registration (`src/templates.ts`)
- Added `register` source port to `mcpServer` template to enable proper graph wiring

#### 5. Test Updates
- Fixed existing tests to work with new lifecycle
- Added comprehensive test coverage for the new behavior
- Created mock that supports multiple container instances

### Benefits Achieved

1. **Container Per Thread**: Each thread gets its own container, eliminating shared state issues
2. **Lazy Provisioning**: Containers only created when tools are actually called
3. **Tool Discovery**: Tools can be registered immediately without keeping containers running
4. **Resource Efficiency**: No persistent containers - only temporary ones for discovery and per-call execution
5. **Thread Safety**: No shared state between different execution threads

### Backward Compatibility
- All existing MCP server interfaces remain compatible
- Graph wiring patterns unchanged (just added source port)
- Tool calling behavior from agent perspective unchanged

### Validation
- All existing tests pass ✅
- New lifecycle tests pass ✅ 
- TypeScript compilation successful ✅
- Tool discovery and execution working correctly ✅