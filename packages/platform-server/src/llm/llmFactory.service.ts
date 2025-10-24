import { Injectable } from '@nestjs/common';
import { ConfigService } from '../core/services/config.service';
import { LLM } from '@agyn/llm';
import { LLMProvisioner } from './llm.provisioner';

@Injectable()
export class LLMFactoryService {
  constructor(private configService: ConfigService, private provisioner: LLMProvisioner) {}

  async createLLM() {
    // Deprecated: prefer injecting provisioner directly and calling getLLM()
    return await this.provisioner.getLLM();
  }
}
