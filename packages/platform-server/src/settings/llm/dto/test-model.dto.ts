import { IsOptional, IsString } from 'class-validator';

export class TestModelDto {
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
