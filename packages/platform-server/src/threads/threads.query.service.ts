import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import { ManageChannelDescriptorSchema } from './thread-channel.schema';

@Injectable()
export class ThreadsQueryService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getThreadAgentTitle(threadId: string): Promise<string | null> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { channel: true, assignedAgentNodeId: true },
    });
    if (!thread) return null;

    const fromChannel = this.extractAgentTitleFromChannel(thread.channel);
    if (fromChannel) return fromChannel;

    const assignedAgentNodeId = this.normalizeString(thread.assignedAgentNodeId);
    if (assignedAgentNodeId) {
      const state = await this.prisma.conversationState.findUnique({
        where: { threadId_nodeId: { threadId, nodeId: assignedAgentNodeId } },
        select: { state: true },
      });
      const resolved = this.extractAgentTitleFromState(state?.state);
      if (resolved) return resolved;
    }

    const latest = await this.prisma.conversationState.findFirst({
      where: { threadId },
      orderBy: { updatedAt: 'desc' },
      select: { state: true },
    });
    return this.extractAgentTitleFromState(latest?.state);
  }

  async getThreadAgentNodeId(threadId: string): Promise<string | null> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { assignedAgentNodeId: true },
    });
    if (!thread) return null;

    const assigned = this.normalizeString(thread.assignedAgentNodeId);
    if (assigned) return assigned;

    const state = await this.prisma.conversationState.findFirst({
      where: { threadId },
      orderBy: { updatedAt: 'desc' },
      select: { nodeId: true },
    });
    const nodeId = this.normalizeString(state?.nodeId);
    return nodeId ?? null;
  }

  async getParentThreadIdAndAlias(childThreadId: string): Promise<{ parentThreadId: string | null; alias: string | null }> {
    const thread = await this.prisma.thread.findUnique({ where: { id: childThreadId }, select: { parentId: true, alias: true } });
    if (!thread) return { parentThreadId: null, alias: null };
    return {
      parentThreadId: this.normalizeString(thread.parentId),
      alias: this.normalizeString(thread.alias),
    };
  }

  private extractAgentTitleFromChannel(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const parsed = ManageChannelDescriptorSchema.safeParse(raw);
    if (!parsed.success) return null;
    const title = this.normalizeString(parsed.data.meta?.agentTitle);
    return title ?? null;
  }

  private extractAgentTitleFromState(state: unknown): string | null {
    if (!state || typeof state !== 'object') return null;
    const record = state as Record<string, unknown>;

    const direct = this.normalizeString(record.title);
    if (direct) return direct;

    const profile = record.profile;
    if (profile && typeof profile === 'object') {
      const profileRecord = profile as Record<string, unknown>;
      const profileTitle = this.normalizeString(profileRecord.title);
      if (profileTitle) return profileTitle;
      const name = this.normalizeString(profileRecord.name);
      const role = this.normalizeString(profileRecord.role);
      if (name && role) return `${name} (${role})`;
      if (name) return name;
      if (role) return role;
    }

    const config = record.config;
    if (config && typeof config === 'object') {
      const configRecord = config as Record<string, unknown>;
      const configTitle = this.normalizeString(configRecord.title);
      if (configTitle) return configTitle;
      const name = this.normalizeString(configRecord.name);
      const role = this.normalizeString(configRecord.role);
      if (name && role) return `${name} (${role})`;
      if (name) return name;
      if (role) return role;
    }

    return null;
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
