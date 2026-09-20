import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunityPostKind, TierLevel } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum CommunitySort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  TOP = 'top',
  ACTIVE = 'active',
}

export class PollOptionInput {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => String(value).trim())
  text!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Link this option to a catalogue entry' })
  @IsOptional()
  @IsUUID()
  animeId?: string;
}

export class PollInput {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question!: string;

  @ApiProperty({ type: [PollOptionInput], minItems: 2, maxItems: 12 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PollOptionInput)
  options!: PollOptionInput[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({ description: 'ISO date after which voting closes' })
  @IsOptional()
  @IsDateString()
  closesAt?: string;
}

export class TierListItemInput {
  @ApiProperty({ enum: TierLevel })
  @IsEnum(TierLevel)
  tier!: TierLevel;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  animeId?: string;
}

export class CreatePostDto {
  @ApiProperty({ description: 'Category slug' })
  @IsString()
  categorySlug!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  @Transform(({ value }) => String(value).trim())
  title!: string;

  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MinLength(5)
  @MaxLength(20000)
  body!: string;

  @ApiPropertyOptional({ enum: CommunityPostKind, default: CommunityPostKind.TEXT })
  @IsOptional()
  @IsEnum(CommunityPostKind)
  kind?: CommunityPostKind;

  @ApiPropertyOptional({ type: PollInput, description: 'Required for POLL and MATCHUP posts' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PollInput)
  poll?: PollInput;

  @ApiPropertyOptional({ type: [TierListItemInput], description: 'Required for TIER_LIST posts' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TierListItemInput)
  tierList?: TierListItemInput[];

  @ApiPropertyOptional({ type: [String], description: 'Anime IDs referenced by the post' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  animeIds?: string[];
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(20000)
  body?: string;
}

export class PostQueryDto {
  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: CommunityPostKind })
  @IsOptional()
  @IsEnum(CommunityPostKind)
  kind?: CommunityPostKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: CommunitySort, default: CommunitySort.NEWEST })
  @IsOptional()
  @IsEnum(CommunitySort)
  sort?: CommunitySort = CommunitySort.NEWEST;
}

export class CreateCommunityCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  @Transform(({ value }) => String(value).trim())
  body!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class VoteDto {
  @ApiProperty({ enum: [1, -1] })
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  value!: 1 | -1;
}

export class PollVoteDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  optionIds!: string[];
}
