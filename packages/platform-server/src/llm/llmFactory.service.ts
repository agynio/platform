import { Injectable } from '@nestjs/common';
import { ConfigService } from '../core/services/config.service';
import { LLM } from '@agyn/llm';
import { LLMProvisioner } from './provisioners/types';

@Injectable()
export class LLMFactoryService {
  constructor(private configService: ConfigService, private provisioner: LLMProvisioner) {}

  async createLLM() {
    const client = await this.provisioner.getClient();
    return new LLM(client as any);
  }
}
