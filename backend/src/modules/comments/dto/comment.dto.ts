import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum CommentSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  TOP = 'top',
}

export class CreateCommentDto {
  @ApiPropertyOptional({ description: 'Comment on an anime page' })
  @IsOptional()
  @IsString()
  animeSlug?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Comment on an episode' })
  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Reply to another comment' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  @Transform(({ value }) => String(value).trim())
  body!: string;

  @ApiPropertyOptional({ default: false, description: 'Blurs the comment until the reader opts in' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isSpoiler?: boolean;
}

export class UpdateCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  @Transform(({ value }) => String(value).trim())
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isSpoiler?: boolean;
}

export class CommentQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animeSlug?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  episodeId?: string;

  @ApiPropertyOptional({ enum: CommentSort, default: CommentSort.NEWEST })
  @IsOptional()
  @IsEnum(CommentSort)
  sort?: CommentSort = CommentSort.NEWEST;
}
