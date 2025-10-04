import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const configSchema = z.object({
  port: z.number().default(3001),
  mongoUrl: z.string().min(1, 'MongoDB connection string is required'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  corsEnabled: z.boolean().default(true),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigService implements Config {
  constructor(private params: Config) {}

  get port(): number {
    return this.params.port;
  }

  get mongoUrl(): string {
    return this.params.mongoUrl;
  }

  get logLevel(): 'debug' | 'info' | 'warn' | 'error' {
    return this.params.logLevel;
  }

  get corsEnabled(): boolean {
    return this.params.corsEnabled;
  }

  static fromEnv(): ConfigService {
    const parsed = configSchema.parse({
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URL,
      logLevel: process.env.LOG_LEVEL,
      corsEnabled: process.env.CORS_ENABLED !== 'false',
    });
    return new ConfigService(parsed);
  }
}