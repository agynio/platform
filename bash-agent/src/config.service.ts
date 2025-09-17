import * as dotenv from 'dotenv';
dotenv.config();

export class ConfigService {
    getOpenAIKey(): string {
        const key = process.env.OPENAI_API_KEY;
        if (!key) {
            throw new Error("OPENAI_API_KEY not set in .env");
        }
        return key;
    }
}