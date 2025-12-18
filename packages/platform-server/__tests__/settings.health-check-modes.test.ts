import { describe, it, expect } from 'vitest';
import { LLMSettingsController } from '../src/settings/llm/llmSettings.controller';
import { HEALTH_CHECK_MODES } from '../src/settings/llm/constants';

describe('LLM health check modes alignment', () => {
  it('lists the supported LiteLLM health check modes', () => {
    expect(Array.from(HEALTH_CHECK_MODES)).toMatchInlineSnapshot(`
      [
        "chat",
        "completion",
        "embedding",
        "audio_speech",
        "audio_transcription",
        "image_generation",
        "video_generation",
        "batch",
        "rerank",
        "realtime",
        "responses",
        "ocr",
      ]
    `);
  });

  it('exposes modes via controller endpoint', () => {
    const controller = new LLMSettingsController({} as never);
    expect(controller.getHealthCheckModes()).toEqual({ modes: Array.from(HEALTH_CHECK_MODES) });
  });
});
