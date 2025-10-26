import { IsOptional, IsString } from 'class-validator';

export class KvKeysQueryDto {
  @IsOptional()
  @IsString()
  path?: string;
}

