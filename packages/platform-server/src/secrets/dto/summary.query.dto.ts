import { IsIn, IsOptional, IsString } from 'class-validator';

export class SummaryQueryDto {
  @IsOptional()
  @IsIn(['used', 'missing', 'all'])
  filter?: 'used' | 'missing' | 'all';

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  page_size?: string;

  @IsOptional()
  @IsString()
  mount?: string;

  @IsOptional()
  @IsString()
  path_prefix?: string;
}
