import * as dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

export const configSchema = z.object({
  githubAppId: z.string().min(1, "GitHub App ID is required"),
  githubAppPrivateKey: z.string().min(1, "GitHub App Private Key is required"),
  githubInstallationId: z.string().min(1, "GitHub Installation ID is required"),
  openaiApiKey: z.string().min(1, "OpenAI API key is required"),
  githubToken: z.string().min(1, "GitHub personal access token is required"),
  slackBotToken: z.string().min(1, "Slack bot token is required"),
  slackAppToken: z.string().min(1, "Slack app-level token is required (starts with xapp-)"),
  mongodbUrl: z.string().min(1, "MongoDB connection string is required"),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigService implements Config {
  constructor(private params: Config) {}

  get githubAppId(): string {
    return this.params.githubAppId;
  }

  get githubAppPrivateKey(): string {
    return this.params.githubAppPrivateKey;
  }
  get githubInstallationId(): string {
    return this.params.githubInstallationId;
  }

  get openaiApiKey(): string {
    return this.params.openaiApiKey;
  }
  get githubToken(): string {
    return this.params.githubToken;
  }

  get slackBotToken(): string {
    return this.params.slackBotToken;
  }

  get slackAppToken(): string {
    return this.params.slackAppToken;
  }

  get mongodbUrl(): string {
    return this.params.mongodbUrl;
  }

  static fromEnv(): ConfigService {
    const parsed = configSchema.parse({
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID,
      openaiApiKey: process.env.OPENAI_API_KEY,
      githubToken: process.env.GH_TOKEN,
      slackBotToken: process.env.SLACK_BOT_TOKEN,
      slackAppToken: process.env.SLACK_APP_TOKEN,
      mongodbUrl: process.env.MONGODB_URL,
    });
    return new ConfigService(parsed);
  }
}
