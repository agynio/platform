import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
export const configSchema = z.object({
    port: z.number().default(3001),
    mongoUrl: z.string().min(1, 'MongoDB connection string is required'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    corsEnabled: z.boolean().default(true),
});
export class ConfigService {
    params;
    constructor(params) {
        this.params = params;
    }
    get port() {
        return this.params.port;
    }
    get mongoUrl() {
        return this.params.mongoUrl;
    }
    get logLevel() {
        return this.params.logLevel;
    }
    get corsEnabled() {
        return this.params.corsEnabled;
    }
    static fromEnv() {
        const parsed = configSchema.parse({
            port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
            mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URL,
            logLevel: process.env.LOG_LEVEL,
            corsEnabled: process.env.CORS_ENABLED !== 'false',
        });
        return new ConfigService(parsed);
    }
}
//# sourceMappingURL=config.js.map