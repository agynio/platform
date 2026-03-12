import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/api/http';
import * as teamApi from '@/api/modules/teamApi';
import { TEAM_QUERY_KEYS, useTeamAgents, useTeamAttachments, useTeamMemoryBuckets, useTeamMcpServers, useTeamTools, useTeamWorkspaceConfigurations } from '@/api/hooks/team';
import type { TeamAttachment } from '@/api/types/team';
import { useTemplates } from '@/lib/graph/hooks';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  buildAgentRequest,
  buildAttachmentInputsFromRelations,
  buildMcpServerRequest,
  buildMemoryBucketRequest,
  buildToolRequest,
  buildWorkspaceRequest,
  diffTeamAttachments,
  mapTeamEntities,
} from '../api/teamEntities';
import type { GraphEntityDeleteInput, GraphEntitySummary, GraphEntityUpsertInput } from '../types';

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Request failed';
  const apiError = error as ApiError;
  if (apiError?.message) return apiError.message;
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

function readAttachmentId(attachment: TeamAttachment): string | undefined {
  if (attachment.id && attachment.id.trim().length > 0) return attachment.id;
  if (attachment.meta?.id && attachment.meta.id.trim().length > 0) return attachment.meta.id;
  return undefined;
}

function readAttachmentSideId(attachment: TeamAttachment, key: 'source' | 'target'): string | undefined {
  const record = attachment as Record<string, unknown>;
  const direct = record[`${key}Id`];
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
  const snake = record[`${key}_id`];
  if (typeof snake === 'string' && snake.trim().length > 0) return snake.trim();
  return undefined;
}

export function useTeamEntities() {
  const qc = useQueryClient();
  const templatesQuery = useTemplates();
  const agentsQuery = useTeamAgents();
  const toolsQuery = useTeamTools();
  const mcpServersQuery = useTeamMcpServers();
  const workspaceQuery = useTeamWorkspaceConfigurations();
  const memoryQuery = useTeamMemoryBuckets();
  const attachmentsQuery = useTeamAttachments();

  const entities: GraphEntitySummary[] = useMemo(() => {
    return mapTeamEntities(
      {
        agents: agentsQuery.data,
        tools: toolsQuery.data,
        mcpServers: mcpServersQuery.data,
        workspaceConfigurations: workspaceQuery.data,
        memoryBuckets: memoryQuery.data,
      },
      templatesQuery.data ?? [],
    );
  }, [agentsQuery.data, toolsQuery.data, mcpServersQuery.data, workspaceQuery.data, memoryQuery.data, templatesQuery.data]);

  const invalidateTeamQueries = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.agents }),
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.tools }),
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.mcpServers }),
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.workspaceConfigurations }),
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.memoryBuckets }),
      qc.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.attachments }),
    ]);
  }, [qc]);

  const ensureAttachments = useCallback(async () => {
    if (attachmentsQuery.data) return attachmentsQuery.data;
    const response = await attachmentsQuery.refetch();
    return response.data ?? [];
  }, [attachmentsQuery]);

  const syncAttachments = useCallback(
    async (entityId: string, relations: GraphEntityUpsertInput['relations']) => {
      if (!relations) return;
      const current = await ensureAttachments();
      const relevant = current.filter((attachment) => {
        const sourceId = readAttachmentSideId(attachment, 'source');
        const targetId = readAttachmentSideId(attachment, 'target');
        return sourceId === entityId || targetId === entityId;
      });
      const desired = buildAttachmentInputsFromRelations(relations, entityId);
      const { create, remove } = diffTeamAttachments(relevant, desired);
      if (remove.length > 0) {
        await Promise.all(
          remove.map(async (attachment) => {
            const id = readAttachmentId(attachment);
            if (!id) return;
            await teamApi.deleteAttachment(id);
          }),
        );
      }
      if (create.length > 0) {
        await Promise.all(
          create.map((attachment) =>
            teamApi.createAttachment({
              kind: attachment.kind,
              source_id: attachment.sourceId,
              target_id: attachment.targetId,
              sourceId: attachment.sourceId,
              targetId: attachment.targetId,
            }),
          ),
        );
      }
    },
    [ensureAttachments],
  );

  const createMutation = useMutation({
    mutationFn: async (input: GraphEntityUpsertInput) => {
      switch (input.entityKind) {
        case 'agent': {
          const created = await teamApi.createAgent(buildAgentRequest(input));
          const id = created.id ?? created.meta?.id;
          if (typeof id === 'string' && id.length > 0) {
            await syncAttachments(id, input.relations);
          }
          return created;
        }
        case 'tool': {
          const created = await teamApi.createTool(buildToolRequest(input));
          return created;
        }
        case 'mcp': {
          const created = await teamApi.createMcpServer(buildMcpServerRequest(input));
          const id = created.id ?? created.meta?.id;
          if (typeof id === 'string' && id.length > 0) {
            await syncAttachments(id, input.relations);
          }
          return created;
        }
        case 'workspace': {
          return teamApi.createWorkspaceConfiguration(buildWorkspaceRequest(input));
        }
        case 'memory': {
          return teamApi.createMemoryBucket(buildMemoryBucketRequest(input));
        }
        default:
          throw new Error(`Unsupported entity kind: ${input.entityKind}`);
      }
    },
    onSuccess: async () => {
      await invalidateTeamQueries();
      notifySuccess('Entity created');
    },
    onError: (error: unknown) => {
      notifyError(extractErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: GraphEntityUpsertInput) => {
      if (!input.id) throw new Error('Entity id missing');
      const existing = entities.find((entity) => entity.id === input.id);
      switch (input.entityKind) {
        case 'agent': {
          const payload = buildAgentRequest(input, existing);
          const updated = await teamApi.updateAgent(input.id, { id: input.id, ...payload });
          await syncAttachments(input.id, input.relations);
          return updated;
        }
        case 'tool': {
          const payload = buildToolRequest(input, existing);
          return teamApi.updateTool(input.id, { id: input.id, ...payload });
        }
        case 'mcp': {
          const payload = buildMcpServerRequest(input, existing);
          const updated = await teamApi.updateMcpServer(input.id, { id: input.id, ...payload });
          await syncAttachments(input.id, input.relations);
          return updated;
        }
        case 'workspace': {
          const payload = buildWorkspaceRequest(input, existing);
          return teamApi.updateWorkspaceConfiguration(input.id, { id: input.id, ...payload });
        }
        case 'memory': {
          const payload = buildMemoryBucketRequest(input, existing);
          return teamApi.updateMemoryBucket(input.id, { id: input.id, ...payload });
        }
        default:
          throw new Error(`Unsupported entity kind: ${input.entityKind}`);
      }
    },
    onSuccess: async () => {
      await invalidateTeamQueries();
      notifySuccess('Entity updated');
    },
    onError: (error: unknown) => {
      notifyError(extractErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: GraphEntityDeleteInput) => {
      switch (input.entityKind) {
        case 'agent':
          await teamApi.deleteAgent(input.id);
          break;
        case 'tool':
          await teamApi.deleteTool(input.id);
          break;
        case 'mcp':
          await teamApi.deleteMcpServer(input.id);
          break;
        case 'workspace':
          await teamApi.deleteWorkspaceConfiguration(input.id);
          break;
        case 'memory':
          await teamApi.deleteMemoryBucket(input.id);
          break;
        default:
          throw new Error(`Unsupported entity kind: ${input.entityKind}`);
      }
    },
    onSuccess: async () => {
      await invalidateTeamQueries();
      notifySuccess('Entity deleted');
    },
    onError: (error: unknown) => {
      notifyError(extractErrorMessage(error));
    },
  });

  return {
    entities,
    templatesQuery,
    attachmentsQuery,
    createEntity: createMutation.mutateAsync,
    updateEntity: updateMutation.mutateAsync,
    deleteEntity: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    isLoading:
      templatesQuery.isLoading ||
      agentsQuery.isLoading ||
      toolsQuery.isLoading ||
      mcpServersQuery.isLoading ||
      workspaceQuery.isLoading ||
      memoryQuery.isLoading ||
      attachmentsQuery.isLoading,
    hasError:
      templatesQuery.isError ||
      agentsQuery.isError ||
      toolsQuery.isError ||
      mcpServersQuery.isError ||
      workspaceQuery.isError ||
      memoryQuery.isError ||
      attachmentsQuery.isError,
  } as const;
}
