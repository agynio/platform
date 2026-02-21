import { z } from 'zod';

const defaultZitiConfig = {
  identityFile: '.ziti/identities/dev.agyn-platform.docker-runner.json',
  serviceName: 'dev.agyn-platform.platform-api',
} as const;

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
      identityFile: z
        .string()
        .min(1, 'ZITI_IDENTITY_FILE is required')
        .default(defaultZitiConfig.identityFile),
      serviceName: z
        .string()
        .min(1, 'ZITI_SERVICE_NAME is required')
        .default(defaultZitiConfig.serviceName),
    })
    .default(() => ({ ...defaultZitiConfig })),
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
      identityFile: env.ZITI_IDENTITY_FILE,
      serviceName: env.ZITI_SERVICE_NAME,
    },
  });
  if (!parsed.success) {
    throw new Error(`Invalid docker-runner configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
