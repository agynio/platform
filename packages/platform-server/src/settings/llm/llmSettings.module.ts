import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { LLMSettingsController } from './llmSettings.controller';
import { LLMSettingsService } from './llmSettings.service';

@Module({
  imports: [CoreModule],
  controllers: [LLMSettingsController],
  providers: [LLMSettingsService],
  exports: [LLMSettingsService],
})
export class LLMSettingsModule {}
