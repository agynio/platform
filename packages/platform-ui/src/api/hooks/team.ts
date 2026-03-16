import { useQuery } from '@tanstack/react-query';

import * as teamApi from '../modules/teamApi';
import type {
  TeamAgent,
  TeamAttachment,
  TeamMemoryBucket,
  TeamMcpServer,
  TeamTool,
  TeamWorkspaceConfiguration,
} from '../types/team';

const DEFAULT_STALE_TIME = 15_000;

export const TEAM_QUERY_KEYS = {
  agents: ['team', 'agents'] as const,
  tools: ['team', 'tools'] as const,
  mcpServers: ['team', 'mcpServers'] as const,
  workspaceConfigurations: ['team', 'workspaceConfigurations'] as const,
  memoryBuckets: ['team', 'memoryBuckets'] as const,
  attachments: ['team', 'attachments'] as const,
};

export function useTeamAgents() {
  return useQuery<TeamAgent[]>({
    queryKey: TEAM_QUERY_KEYS.agents,
    queryFn: () => teamApi.listAllAgents(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useTeamTools() {
  return useQuery<TeamTool[]>({
    queryKey: TEAM_QUERY_KEYS.tools,
    queryFn: () => teamApi.listAllTools(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useTeamMcpServers() {
  return useQuery<TeamMcpServer[]>({
    queryKey: TEAM_QUERY_KEYS.mcpServers,
    queryFn: () => teamApi.listAllMcpServers(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useTeamWorkspaceConfigurations() {
  return useQuery<TeamWorkspaceConfiguration[]>({
    queryKey: TEAM_QUERY_KEYS.workspaceConfigurations,
    queryFn: () => teamApi.listAllWorkspaceConfigurations(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useTeamMemoryBuckets() {
  return useQuery<TeamMemoryBucket[]>({
    queryKey: TEAM_QUERY_KEYS.memoryBuckets,
    queryFn: () => teamApi.listAllMemoryBuckets(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useTeamAttachments() {
  return useQuery<TeamAttachment[]>({
    queryKey: TEAM_QUERY_KEYS.attachments,
    queryFn: () => teamApi.listAllAttachments(),
    staleTime: DEFAULT_STALE_TIME,
  });
}
