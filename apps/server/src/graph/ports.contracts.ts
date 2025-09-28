import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { BaseTool } from '../tools/base.tool';
import { McpServer } from '../mcp';
import { Agent } from '../agents/agent';

export interface ContainerProviderAware { setContainerProvider(p?: ContainerProviderEntity): void; }
export interface ToolAttachable { addTool(t: BaseTool): void; removeTool(t: BaseTool): void; }
export interface McpAttachable { addMcpServer(s: McpServer): Promise<void>; removeMcpServer(s: McpServer): Promise<void>; }
export interface AgentCallable { setAgent(a?: Agent): void; }
