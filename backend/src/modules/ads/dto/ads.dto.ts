import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Shape stored in AdPlacement.config for the single VIDEO placement. */
export interface VideoAdConfig {
  vastTagUrl?: string;
  preRoll?: boolean;
  midRoll?: boolean;
  postRoll?: boolean;
  /** Fallback spacing when no explicit cue points are configured. */
  midRollIntervalSeconds?: number;
  /** Explicit mid-roll positions in seconds from the start of the episode. */
  midRollCuePoints?: number[];
  frequencyCapPerHour?: number;
}

export class UpsertAdPlacementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional({ enum: AdType })
  @IsOptional()
  @IsEnum(AdType)
  type?: AdType;

  @ApiPropertyOptional({ description: 'AdSense publisher ID, e.g. ca-pub-0000000000000000' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  adClient?: string;

  @ApiPropertyOptional({ description: 'AdSense ad unit slot ID' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  adSlot?: string;

  @ApiPropertyOptional({ default: 'auto' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fullWidthResponsive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'VIDEO placements only: IMA/VAST configuration' })
  @IsOptional()
  @IsObject()
  config?: VideoAdConfig;
}

export class VideoAdConfigDto {
  @ApiPropertyOptional({ description: 'VAST/VMAP tag URL from Google Ad Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vastTagUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  preRoll?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  midRoll?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  postRoll?: boolean;

  @ApiPropertyOptional({ minimum: 60, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  midRollIntervalSeconds?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  midRollCuePoints?: number[];

  @ApiPropertyOptional({ minimum: 0, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  frequencyCapPerHour?: number;
}
