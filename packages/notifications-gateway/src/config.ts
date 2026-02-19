import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEFAULT_NOTIFICATIONS_CHANNEL = 'notifications.v1' as const;

const configSchema = z.object({
  port: z
    .union([z.string(), z.number()])
    .default(3011)
    .transform((value) => {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error('PORT must be a valid TCP port');
      }
      return parsed;
    }),
  host: z.string().default('0.0.0.0'),
  socketPath: z
    .string()
    .default('/socket.io')
    .transform((value) => (value.startsWith('/') ? value : `/${value}`)),
  notificationsRedisUrl: z
    .string()
    .min(1, 'NOTIFICATIONS_REDIS_URL is required')
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'NOTIFICATIONS_REDIS_URL must start with redis:// or rediss://',
    }),
  redisChannel: z.string().min(1).default(DEFAULT_NOTIFICATIONS_CHANNEL),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type GatewayConfig = z.infer<typeof configSchema>;

export function loadConfig(): GatewayConfig {
  return configSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    socketPath: process.env.SOCKET_IO_PATH,
    notificationsRedisUrl: process.env.NOTIFICATIONS_REDIS_URL,
    redisChannel: process.env.NOTIFICATIONS_CHANNEL ?? DEFAULT_NOTIFICATIONS_CHANNEL,
    logLevel: process.env.LOG_LEVEL,
  });
}
