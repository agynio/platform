import { z } from 'zod';

const runnerConfigSchema = z.object({
  port: z
    .union([z.string(), z.number()])
    .default('7071')
    .transform((value) => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : 7071;
    }),
  host: z.string().default('0.0.0.0'),
  accessKey: z.string().min(1, 'DOCKER_RUNNER_ACCESS_KEY is required'),
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
});

export type RunnerConfig = z.infer<typeof runnerConfigSchema>;

export function loadRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const parsed = runnerConfigSchema.safeParse({
    port: env.DOCKER_RUNNER_PORT,
    host: env.DOCKER_RUNNER_HOST,
    accessKey: env.DOCKER_RUNNER_ACCESS_KEY,
    sharedSecret: env.DOCKER_RUNNER_SHARED_SECRET,
    signatureTtlMs: env.DOCKER_RUNNER_SIGNATURE_TTL_MS,
    dockerSocket: env.DOCKER_SOCKET ?? env.DOCKER_RUNNER_SOCKET,
    logLevel: env.DOCKER_RUNNER_LOG_LEVEL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid docker-runner configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
