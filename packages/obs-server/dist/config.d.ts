import { z } from 'zod';
export declare const configSchema: z.ZodObject<{
    port: z.ZodDefault<z.ZodNumber>;
    mongoUrl: z.ZodString;
    logLevel: z.ZodDefault<z.ZodEnum<{
        error: "error";
        debug: "debug";
        info: "info";
        warn: "warn";
    }>>;
    corsEnabled: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type Config = z.infer<typeof configSchema>;
export declare class ConfigService implements Config {
    private params;
    constructor(params: Config);
    get port(): number;
    get mongoUrl(): string;
    get logLevel(): 'debug' | 'info' | 'warn' | 'error';
    get corsEnabled(): boolean;
    static fromEnv(): ConfigService;
}
