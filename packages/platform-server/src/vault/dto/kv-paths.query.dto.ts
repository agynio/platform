import { IsOptional, IsString } from 'class-validator';

export class KvPathsQueryDto {
  @IsOptional()
  @IsString()
  prefix?: string;
}

