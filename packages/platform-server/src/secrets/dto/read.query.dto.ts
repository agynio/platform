import { IsOptional, IsString } from 'class-validator';

export class ReadQueryDto {
  @IsOptional()
  @IsString()
  reveal?: string;
}
