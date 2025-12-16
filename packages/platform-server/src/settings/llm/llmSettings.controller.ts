import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { LLMSettingsService } from './llmSettings.service';
import {
  CreateCredentialDto,
  CreateModelDto,
  TestCredentialDto,
  TestModelDto,
  UpdateCredentialDto,
  UpdateModelDto,
} from './dto';
import { HEALTH_CHECK_MODES } from './constants';

@Controller('api/settings/llm')
export class LLMSettingsController {
  constructor(@Inject(LLMSettingsService) private readonly llmSettings: LLMSettingsService) {}

  @Get('providers')
  async listProviders() {
    return this.llmSettings.listProviders();
  }

  @Get('admin-status')
  async getAdminStatus() {
    return this.llmSettings.getAdminStatus();
  }

  @Get('credentials')
  async listCredentials() {
    return this.llmSettings.listCredentials();
  }

  @Get('health-check-modes')
  getHealthCheckModes() {
    return { modes: HEALTH_CHECK_MODES };
  }

  @Post('credentials')
  async createCredential(@Body() dto: CreateCredentialDto) {
    return this.llmSettings.createCredential({
      name: dto.name,
      provider: dto.provider,
      tags: dto.tags,
      metadata: dto.metadata,
      values: dto.values,
    });
  }

  @Patch('credentials/:name')
  async updateCredential(@Param('name') name: string, @Body() dto: UpdateCredentialDto) {
    return this.llmSettings.updateCredential({
      name,
      provider: dto.provider,
      tags: dto.tags,
      metadata: dto.metadata,
      values: dto.values,
    });
  }

  @Delete('credentials/:name')
  async deleteCredential(@Param('name') name: string) {
    return this.llmSettings.deleteCredential(name);
  }

  @Post('credentials/:name/test')
  async testCredential(@Param('name') name: string, @Body() dto: TestCredentialDto) {
    return this.llmSettings.testCredential({
      name,
      model: dto.model,
      mode: dto.mode,
      input: dto.input,
    });
  }

  @Get('models')
  async listModels() {
    const models = await this.llmSettings.listModels();
    return { models };
  }

  @Post('models')
  async createModel(@Body() dto: CreateModelDto) {
    return this.llmSettings.createModel({
      name: dto.name,
      provider: dto.provider,
      model: dto.model,
      credentialName: dto.credentialName,
      mode: dto.mode,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      topP: dto.topP,
      frequencyPenalty: dto.frequencyPenalty,
      presencePenalty: dto.presencePenalty,
      stream: dto.stream,
      rpm: dto.rpm,
      tpm: dto.tpm,
      metadata: dto.metadata,
      params: dto.params,
    });
  }

  @Patch('models/:id')
  async updateModel(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.llmSettings.updateModel({
      id,
      name: dto.name,
      provider: dto.provider,
      model: dto.model,
      credentialName: dto.credentialName,
      mode: dto.mode,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      topP: dto.topP,
      frequencyPenalty: dto.frequencyPenalty,
      presencePenalty: dto.presencePenalty,
      stream: dto.stream,
      rpm: dto.rpm,
      tpm: dto.tpm,
      metadata: dto.metadata,
      params: dto.params,
    });
  }

  @Delete('models/:id')
  async deleteModel(@Param('id') id: string) {
    return this.llmSettings.deleteModel(id);
  }

  @Post('models/:id/test')
  async testModel(@Param('id') id: string, @Body() dto: TestModelDto) {
    return this.llmSettings.testModel({
      id,
      mode: dto.mode,
      overrideModel: dto.overrideModel,
      input: dto.input,
      credentialName: dto.credentialName,
    });
  }
}
