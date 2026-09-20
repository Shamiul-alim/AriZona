import { ApiPropertyOptional } from '@nestjs/swagger';
import { TitlePreference } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 24 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username may only contain letters, numbers and underscores' })
  username?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: TitlePreference, description: 'Show English or Japanese titles site-wide' })
  @IsOptional()
  @IsEnum(TitlePreference)
  titlePreference?: TitlePreference;

  @ApiPropertyOptional({ description: 'Preferred audio language tag, e.g. "ja" or "en"' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredAudio?: string;

  @ApiPropertyOptional({ description: 'Preferred subtitle language tag, or "off"' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredSubtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  autoplayNext?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  autoSkipIntro?: boolean;
}
