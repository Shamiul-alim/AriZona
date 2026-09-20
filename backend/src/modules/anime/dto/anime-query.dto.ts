import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AgeRating,
  AnimeSeason,
  AnimeSource,
  AnimeStatus,
  AnimeType,
  MediaKind,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

export enum AnimeSort {
  DEFAULT = 'default',
  LATEST_UPDATED = 'updated',
  LATEST_ADDED = 'added',
  SCORE = 'score',
  NAME_ASC = 'name',
  NAME_DESC = 'name_desc',
  RELEASE_DATE = 'release',
  MOST_VIEWED = 'views',
  EPISODE_COUNT = 'episodes',
  TRENDING = 'trending',
}

/** Splits `a,b,c` or repeated params into an array. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export class AnimeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search across English, Japanese and alternative titles' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => String(value).trim())
  q?: string;

  @ApiPropertyOptional({ isArray: true, type: String, description: 'Genre slugs' })
  @IsOptional()
  @IsArray()
  @Transform(toArray)
  genres?: string[];

  @ApiPropertyOptional({ enum: AnimeType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AnimeType, { each: true })
  @Transform(toArray)
  type?: AnimeType[];

  @ApiPropertyOptional({ enum: AnimeStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AnimeStatus, { each: true })
  @Transform(toArray)
  status?: AnimeStatus[];

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
  year?: number;

  @ApiPropertyOptional({ enum: AgeRating, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AgeRating, { each: true })
  @Transform(toArray)
  ageRating?: AgeRating[];

  @ApiPropertyOptional({ enum: AnimeSource, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AnimeSource, { each: true })
  @Transform(toArray)
  source?: AnimeSource[];

  @ApiPropertyOptional({ enum: MediaKind, description: 'Only titles that have SUB or DUB episodes' })
  @IsOptional()
  @IsEnum(MediaKind)
  language?: MediaKind;

  @ApiPropertyOptional({ description: 'Studio slug' })
  @IsOptional()
  @IsString()
  studio?: string;

  @ApiPropertyOptional({ description: 'Producer slug' })
  @IsOptional()
  @IsString()
  producer?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minEpisodes?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEpisodes?: number;

  @ApiPropertyOptional({ description: "A-Z browsing: a single letter, '#' for symbols, or '0-9' for digits" })
  @IsOptional()
  @IsString()
  @Matches(/^([A-Za-z]|#|0-9|all)$/, { message: "letter must be A-Z, '#', '0-9' or 'all'" })
  letter?: string;

  @ApiPropertyOptional({ enum: AnimeSort, default: AnimeSort.DEFAULT })
  @IsOptional()
  @IsEnum(AnimeSort)
  sort?: AnimeSort = AnimeSort.DEFAULT;

  @ApiPropertyOptional({ description: 'Hide titles already on the signed-in user’s list' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  hideInList?: boolean;

  @ApiPropertyOptional({ description: 'Minimum average score (0-10)' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10)
  minScore?: number;
}
