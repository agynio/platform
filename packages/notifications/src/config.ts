import { z } from 'zod';

const envSchema = z.object({
  NOTIFICATIONS_GRPC_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(50_051),
  NOTIFICATIONS_SOCKET_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4_000),
  NOTIFICATIONS_HOST: z
    .string()
    .default('0.0.0.0')
    .transform((value) => value.trim().length > 0 ? value.trim() : '0.0.0.0'),
  NOTIFICATIONS_SOCKET_PATH: z
    .string()
    .default('/socket.io')
    .transform((value) => (value.startsWith('/') ? value : `/${value}`)),
  NOTIFICATIONS_SOCKET_CORS_ORIGINS: z.string().optional(),
  LOG_LEVEL: z
    .string()
    .default('info')
    .transform((value) => value.trim().length > 0 ? value.trim() : 'info'),
});

export type Config = {
  grpcPort: number;
  socketPort: number;
  host: string;
  socketPath: string;
  socketCorsOrigins: string[];
  logLevel: string;
};

const parseCorsOrigins = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

export const loadConfig = (): Config => {
  const env = envSchema.parse(process.env);
  return {
    grpcPort: env.NOTIFICATIONS_GRPC_PORT,
    socketPort: env.NOTIFICATIONS_SOCKET_PORT,
    host: env.NOTIFICATIONS_HOST,
    socketPath: env.NOTIFICATIONS_SOCKET_PATH,
    socketCorsOrigins: parseCorsOrigins(env.NOTIFICATIONS_SOCKET_CORS_ORIGINS),
    logLevel: env.LOG_LEVEL,
  };
};
