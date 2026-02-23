import { Body, Controller, HttpException, HttpStatus, Inject, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorkspaceProvider } from '../../workspace/providers/workspace.provider';
import { PrismaService } from '../../core/services/prisma.service';
import { ConfigService } from '../../core/services/config.service';

const CreateWorkspaceSchema = z
  .object({
    alias: z.string().min(1).max(200).optional(),
  })
  .strict();

const TEST_IMAGE = 'nginx:1.25-alpine';
const TEST_NODE_ID = 'workspace-fullstack-node';
const TEST_SUITE = 'containers-fullstack';
const DEFAULT_TTL_SECONDS = 600;

@Controller('test/workspaces')
export class TestWorkspacesController {
  constructor(
    @Inject(WorkspaceProvider) private readonly workspaceProvider: WorkspaceProvider,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<{ containerId: string; threadId: string }> {
    const parsedResult = CreateWorkspaceSchema.safeParse(body ?? {});
    if (!parsedResult.success) {
      throw new HttpException(
        { error: 'BAD_SCHEMA', details: parsedResult.error.format() },
        HttpStatus.BAD_REQUEST,
      );
    }

    const alias = parsedResult.data.alias ?? `fullstack-${randomUUID().slice(0, 5)}`;
    const threadId = randomUUID();
    const prisma = this.prismaService.getClient();
    await prisma.thread.create({ data: { id: threadId, alias } });

    const { workspaceId } = await this.workspaceProvider.ensureWorkspace(
      { threadId, nodeId: TEST_NODE_ID, role: 'workspace' },
      {
        image: TEST_IMAGE,
        persistentVolume: { mountPath: '/workspace' },
        network: { name: this.configService.workspaceNetworkName },
        env: { TEST_SUITE },
        ttlSeconds: DEFAULT_TTL_SECONDS,
      },
    );

    return { containerId: workspaceId, threadId };
  }
}
