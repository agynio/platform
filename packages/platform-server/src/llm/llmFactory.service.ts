import { Injectable } from '@nestjs/common';
import { ConfigService } from '../core/services/config.service';
import { LLM } from '@agyn/llm';
import { LLMProvisionerFactory } from './provisioners/factory';
import { LoggerService } from '../core/services/logger.service';

@Injectable()
export class LLMFactoryService {
  private provisionerFactory: LLMProvisionerFactory;
  constructor(private configService: ConfigService) {
    // LoggerService is lightweight; create local instance to avoid changing constructor signature
    const logger = new LoggerService();
    this.provisionerFactory = new LLMProvisionerFactory(this.configService, logger);
  }

  createLLM() {
    const provisioner = this.provisionerFactory.getProvisioner();
    // Provide a lazy OpenAI-like shim that forwards to provisioned client on first use.
    const clientPromise = provisioner.getOpenAIClient();
    const lazyClient: any = {
      responses: {
        create: async (args: any) => {
          const c = await clientPromise;
          return c.responses.create(args);
        },
      },
    };
    return new LLM(lazyClient);
  }
}
