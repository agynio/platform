import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEFAULT_NOTIFICATIONS_CHANNEL = 'notifications.v1' as const;

const parseBooleanFlag = z
  .union([z.string(), z.boolean(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error('NOTIFICATIONS_REDIS_ENABLED must be boolean-like');
  });

const redisUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.startsWith('redis://') || value.startsWith('rediss://'), {
    message: 'NOTIFICATIONS_REDIS_URL must start with redis:// or rediss://',
  })
  .transform((value) => (value.length === 0 ? undefined : value));

const configSchema = z
  .object({
    port: z
      .union([z.string(), z.number()])
      .default(4000)
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
    notificationsRedisUrl: redisUrlSchema.optional(),
    notificationsRedisEnabledFlag: parseBooleanFlag,
    redisChannel: z.string().min(1).default(DEFAULT_NOTIFICATIONS_CHANNEL),
    logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    corsOrigin: z
      .string()
      .default('*')
      .transform((value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '*') return '*';
        const origins = trimmed
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
        return origins.length ? origins : '*';
      }),
  })
  .superRefine((value, ctx) => {
    const enabled = value.notificationsRedisEnabledFlag ?? Boolean(value.notificationsRedisUrl);
    if (enabled && !value.notificationsRedisUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'NOTIFICATIONS_REDIS_URL is required when Redis is enabled', path: ['notificationsRedisUrl'] });
    }
  });

export type GatewayConfig = {
  port: number;
  host: string;
  socketPath: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  corsOrigin: '*' | string[];
  redis: {
    enabled: boolean;
    url: string | null;
    channel: string;
  };
};

export function loadConfig(): GatewayConfig {
  const parsed = configSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    socketPath: process.env.SOCKET_IO_PATH,
    notificationsRedisUrl: process.env.NOTIFICATIONS_REDIS_URL,
    notificationsRedisEnabledFlag: process.env.NOTIFICATIONS_REDIS_ENABLED,
    redisChannel: process.env.NOTIFICATIONS_CHANNEL ?? DEFAULT_NOTIFICATIONS_CHANNEL,
    logLevel: process.env.LOG_LEVEL,
    corsOrigin: process.env.CORS_ORIGIN,
  });

  const enabled = parsed.notificationsRedisEnabledFlag ?? Boolean(parsed.notificationsRedisUrl);
  return {
    port: parsed.port,
    host: parsed.host,
    socketPath: parsed.socketPath,
    logLevel: parsed.logLevel,
    corsOrigin: parsed.corsOrigin,
    redis: {
      enabled,
      url: enabled ? parsed.notificationsRedisUrl ?? null : null,
      channel: parsed.redisChannel,
    },
  };
}
