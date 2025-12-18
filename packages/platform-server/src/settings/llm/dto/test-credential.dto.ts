import { IsIn, IsOptional, IsString } from 'class-validator';
import { HEALTH_CHECK_MODE_VALUES, type HealthCheckMode } from '../constants';

export class TestCredentialDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  input?: string;

  @IsOptional()
  @IsIn(HEALTH_CHECK_MODE_VALUES)
  mode?: HealthCheckMode;
}

export type { HealthCheckMode };
