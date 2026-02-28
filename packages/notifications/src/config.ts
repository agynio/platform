import { z } from 'zod';

const envSchema = z.object({
  NOTIFICATIONS_GRPC_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(50_051),
  NOTIFICATIONS_HOST: z
    .string()
    .default('0.0.0.0')
    .transform((value) => value.trim().length > 0 ? value.trim() : '0.0.0.0'),
  NOTIFICATIONS_REDIS_URL: z
    .string()
    .min(1, 'NOTIFICATIONS_REDIS_URL is required')
    .transform((value) => value.trim()),
  NOTIFICATIONS_CHANNEL: z
    .string()
    .default('notifications.v1')
    .transform((value) => value.trim().length > 0 ? value.trim() : 'notifications.v1'),
  LOG_LEVEL: z
    .string()
    .default('info')
    .transform((value) => value.trim().length > 0 ? value.trim() : 'info'),
});

export type Config = {
  grpcPort: number;
  host: string;
  redisUrl: string;
  redisChannel: string;
  logLevel: string;
};

export const loadConfig = (): Config => {
  const env = envSchema.parse(process.env);
  return {
    grpcPort: env.NOTIFICATIONS_GRPC_PORT,
    host: env.NOTIFICATIONS_HOST,
    redisUrl: env.NOTIFICATIONS_REDIS_URL,
    redisChannel: env.NOTIFICATIONS_CHANNEL,
    logLevel: env.LOG_LEVEL,
  };
};
