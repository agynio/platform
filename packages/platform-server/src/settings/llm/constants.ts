export const HEALTH_CHECK_MODES = [
  'chat',
  'completion',
  'embedding',
  'audio_speech',
  'audio_transcription',
  'image_generation',
  'video_generation',
  'batch',
  'rerank',
  'realtime',
  'responses',
  'ocr',
] as const;

export const HEALTH_CHECK_MODE_VALUES = Array.from(HEALTH_CHECK_MODES);

export type HealthCheckMode = (typeof HEALTH_CHECK_MODES)[number];
