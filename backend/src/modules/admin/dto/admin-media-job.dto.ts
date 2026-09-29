import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VideoQuality } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** How a worker reports the end of a job. */
export class CompleteMediaJobDto {
  @ApiProperty({ description: 'True only when every expected step succeeded or was not applicable.' })
  @IsBoolean()
  ready!: boolean;

  @ApiPropertyOptional({
    description: 'Why it failed, in words an operator can act on. Recorded verbatim and shown in the admin panel.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}

/** One step of the pipeline, reported as the worker moves through it. */
export class ReportProgressDto {
  @ApiProperty({ example: 'ENCODING_720P' })
  @IsString()
  @MaxLength(60)
  step!: string;

  @ApiPropertyOptional({ description: 'Human detail for the admin panel, e.g. "3 of 4 renditions".' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  detail?: string;
}

/** A rendition the worker produced and stored. */
export class ProducedVariantDto {
  @ApiProperty({ enum: VideoQuality })
  @IsEnum(VideoQuality)
  quality!: VideoQuality;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  driveFileId!: string;
}

/** A playable audio file extracted from the master. */
export class ProducedAudioDto {
  @ApiProperty()
  @IsString()
  @MaxLength(16)
  language!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  driveFileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** A WebVTT subtitle converted from the master. */
export class ProducedSubtitleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(16)
  language!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  driveFileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isForced?: boolean;
}

/**
 * Everything one job produced, registered in a single call.
 *
 * The worker does not use the episode endpoints for this: those belong to an
 * admin and can replace media wholesale, which is far more authority than a
 * transcoder needs.
 */
export class RegisterMediaDto {
  @ApiProperty({ type: [ProducedVariantDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProducedVariantDto)
  variants!: ProducedVariantDto[];

  @ApiPropertyOptional({ type: [ProducedAudioDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProducedAudioDto)
  audioTracks?: ProducedAudioDto[];

  @ApiPropertyOptional({ type: [ProducedSubtitleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProducedSubtitleDto)
  subtitleTracks?: ProducedSubtitleDto[];
}

/**
 * A worker saying it is still there.
 *
 * Everything is optional except the id, so a worker running an older build can
 * keep reporting presence even as this grows. Nothing here identifies the
 * machine: no hostname, no address, no paths.
 */
export class WorkerHeartbeatDto {
  @ApiProperty({ description: 'Random id the worker generates once and keeps. Not a secret, not a credential.' })
  @IsString()
  @MaxLength(64)
  workerId!: string;

  @ApiPropertyOptional({ example: 'BUSY', description: 'IDLE or BUSY.' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;

  @ApiPropertyOptional({ example: 'Solo Leveling S1E2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentJobLabel?: string;

  @ApiPropertyOptional({ example: 'ENCODING_720P' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  currentStep?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;
}
