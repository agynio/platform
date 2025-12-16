import { describe, it, expect, vi } from 'vitest';

import { LLMSettingsController } from '../src/settings/llm/llmSettings.controller';
import type { LLMSettingsService } from '../src/settings/llm/llmSettings.service';

describe('LLM admin status endpoint', () => {
  it('delegates to the service', async () => {
    const payload = {
      configured: true,
      baseUrl: 'http://127.0.0.1:4000',
      hasMasterKey: true,
      provider: 'litellm',
      adminReachable: true,
    } as const;

    const service = {
      getAdminStatus: vi.fn().mockResolvedValue(payload),
    } as unknown as LLMSettingsService;

    const controller = new LLMSettingsController(service);
    await expect(controller.getAdminStatus()).resolves.toEqual(payload);
    expect(service.getAdminStatus).toHaveBeenCalledTimes(1);
  });
});
