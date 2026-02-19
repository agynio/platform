import { IsOptional, IsString } from 'class-validator';

export class TestCredentialDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  input?: string;
}
