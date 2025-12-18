import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';

export type PersistedLiteLLMKey = {
  alias: string;
  key: string;
  expiresAt: Date | null;
};

@Injectable()
export class LiteLLMKeyStore {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {
    if (!prismaService) {
      throw new Error('LiteLLMKeyStore missing PrismaService dependency');
    }
  }

  async load(alias: string): Promise<PersistedLiteLLMKey | null> {
    const record = await this.prismaService.getClient().liteLLMVirtualKey.findUnique({ where: { alias } });
    if (!record) return null;
    return {
      alias: record.alias,
      key: record.key,
      expiresAt: record.expiresAt,
    };
  }

  async save(record: PersistedLiteLLMKey): Promise<void> {
    await this.prismaService.getClient().liteLLMVirtualKey.upsert({
      where: { alias: record.alias },
      update: { key: record.key, expiresAt: record.expiresAt },
      create: { alias: record.alias, key: record.key, expiresAt: record.expiresAt },
    });
  }

  async delete(alias: string): Promise<void> {
    try {
      await this.prismaService.getClient().liteLLMVirtualKey.delete({ where: { alias } });
    } catch (error) {
      if (!this.isRecordMissingError(error)) throw error;
    }
  }

  private isRecordMissingError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2025');
  }
}
