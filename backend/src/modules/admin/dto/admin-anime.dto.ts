import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AgeRating,
  AnimeSeason,
  AnimeSource,
  AnimeStatus,
  AnimeTitleKind,
  AnimeType,
  PublishStatus,
  RelationKind,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AlternativeTitleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(250)
  title!: string;

  @ApiProperty({ enum: AnimeTitleKind })
  @IsEnum(AnimeTitleKind)
  kind!: AnimeTitleKind;
}

export class RelationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  relatedAnimeId!: string;

  @ApiProperty({ enum: RelationKind })
  @IsEnum(RelationKind)
  kind!: RelationKind;
}

export class CreateAnimeDto {
  @ApiProperty({ maxLength: 250 })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  @Transform(({ value }) => String(value).trim())
  titleEnglish!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  titleJapanese?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  titleRomaji?: string;

  @ApiPropertyOptional({ description: 'Auto-generated from the English title when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  synopsis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  posterUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  trailerUrl?: string;

  @ApiPropertyOptional({ enum: AnimeType })
  @IsOptional()
  @IsEnum(AnimeType)
  type?: AnimeType;

  @ApiPropertyOptional({ enum: AnimeStatus })
  @IsOptional()
  @IsEnum(AnimeStatus)
  status?: AnimeStatus;

  @ApiPropertyOptional({ enum: AnimeSeason })
  @IsOptional()
  @IsEnum(AnimeSeason)
  season?: AnimeSeason;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  releaseYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  airStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  airEndDate?: string;

  @ApiPropertyOptional({ enum: AgeRating })
  @IsOptional()
  @IsEnum(AgeRating)
  ageRating?: AgeRating;

  @ApiPropertyOptional({ enum: AnimeSource })
  @IsOptional()
  @IsEnum(AnimeSource)
  source?: AnimeSource;

  @ApiPropertyOptional({ minimum: 1, maximum: 600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  totalEpisodes?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studioId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  genreIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  producerIds?: string[];

  @ApiPropertyOptional({ type: [AlternativeTitleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AlternativeTitleDto)
  alternativeTitles?: AlternativeTitleDto[];

  @ApiPropertyOptional({ type: [RelationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RelationDto)
  relations?: RelationDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @ApiPropertyOptional({ enum: PublishStatus })
  @IsOptional()
  @IsEnum(PublishStatus)
  publishStatus?: PublishStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;

  @ApiPropertyOptional({ description: 'Reference identifier only — never fetched by the application' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  malId?: number;

  @ApiPropertyOptional({ description: 'Reference identifier only — never fetched by the application' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anilistId?: number;
}

export class UpdateAnimeDto extends CreateAnimeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  declare titleEnglish: string;
}

export class AdminAnimeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: PublishStatus })
  @IsOptional()
  @IsEnum(PublishStatus)
  publishStatus?: PublishStatus;

  @ApiPropertyOptional({ enum: AnimeType })
  @IsOptional()
  @IsEnum(AnimeType)
  type?: AnimeType;

  @ApiPropertyOptional({ description: 'Include soft-deleted records' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeDeleted?: boolean;
}
