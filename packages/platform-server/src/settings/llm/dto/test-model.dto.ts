import { IsIn, IsOptional, IsString } from 'class-validator';
import { HEALTH_CHECK_MODE_VALUES, type HealthCheckMode } from '../constants';

export class TestModelDto {
  @IsOptional()
  @IsIn(HEALTH_CHECK_MODE_VALUES)
  mode?: HealthCheckMode;

  @IsOptional()
  @IsString()
  input?: string;

  @IsOptional()
  @IsString()
  overrideModel?: string;

  @IsOptional()
  @IsString()
  credentialName?: string;
}
