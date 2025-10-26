import { IsString, MinLength } from 'class-validator';

export class KvWriteDto {
  @IsString()
  @MinLength(1)
  path!: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  value!: string;
}

