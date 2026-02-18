import { z } from 'zod';

const booleanFlag = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      const normalized = value.trim().toLowerCase();
      if (!normalized) return defaultValue;
      if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
      return defaultValue;
    });

const runnerConfigSchema = z.object({
  port: z
    .union([z.string(), z.number()])
    .default('7071')
    .transform((value) => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : 7071;
    }),
  host: z.string().default('0.0.0.0'),
  sharedSecret: z.string().min(1, 'DOCKER_RUNNER_SHARED_SECRET is required'),
  signatureTtlMs: z
    .union([z.string(), z.number()])
    .default('60000')
    .transform((value) => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : 60_000;
    }),
  dockerSocket: z.string().default('/var/run/docker.sock'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  ziti: z
    .object({
      enabled: booleanFlag(false),
      identityFile: z.string().default('.ziti/identities/dev.agyn-platform.docker-runner.json'),
      serviceName: z.string().default('dev.agyn-platform.platform-api'),
    })
    .default({}),
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;

export function loadRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const parsed = runnerConfigSchema.safeParse({
    port: env.DOCKER_RUNNER_PORT,
    host: env.DOCKER_RUNNER_HOST,
    sharedSecret: env.DOCKER_RUNNER_SHARED_SECRET,
    signatureTtlMs: env.DOCKER_RUNNER_SIGNATURE_TTL_MS,
    dockerSocket: env.DOCKER_SOCKET ?? env.DOCKER_RUNNER_SOCKET,
    logLevel: env.DOCKER_RUNNER_LOG_LEVEL,
    ziti: {
      enabled: env.ZITI_ENABLED,
      identityFile: env.ZITI_IDENTITY_FILE,
      serviceName: env.ZITI_SERVICE_NAME,
    },
  });
  if (!parsed.success) {
    throw new Error(`Invalid docker-runner configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
