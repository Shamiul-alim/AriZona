import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateAnimeRequestDto {
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(2)
  @MaxLength(250)
  @Transform(({ value }) => String(value).trim())
  title!: string;

  @ApiPropertyOptional({ maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  titleJapanese?: string;

  @ApiPropertyOptional({ description: 'Reference link only — never fetched by the application' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  malUrl?: string;

  @ApiPropertyOptional({ description: 'Reference link only — never fetched by the application' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  anilistUrl?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class UpdateAnimeRequestDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Link to the catalogue entry that fulfils this request' })
  @IsOptional()
  @IsUUID()
  fulfilledAnimeId?: string;
}
