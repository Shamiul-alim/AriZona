import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaKind,
  MediaProvider,
  PublishStatus,
  SubtitleFormat,
  VideoQuality,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One quality rendition. For Drive, `driveFileIdOrUrl` accepts either a bare
 * file ID or any Drive share URL — the service extracts the ID.
 */
export class MediaVariantDto {
  @ApiProperty({ enum: VideoQuality })
  @IsEnum(VideoQuality)
  quality!: VideoQuality;

  @ApiPropertyOptional({ description: 'Drive file ID or share URL (GOOGLE_DRIVE provider)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driveFileIdOrUrl?: string;

  @ApiPropertyOptional({ description: 'Absolute URL (DIRECT_FILE / OBJECT_STORAGE provider)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  directUrl?: string;

  @ApiPropertyOptional({ default: 'video/mp4' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AudioTrackDto {
  @ApiProperty({ description: 'Language tag, e.g. "ja" or "en"' })
  @IsString()
  @MaxLength(16)
  language!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({ description: 'HLS rendition group NAME attribute' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  hlsGroupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * A separate audio FILE for the whole episode (Japanese.m4a, English-Dub.m4a…).
 * Played in sync with whichever video quality is showing.
 */
export class EpisodeAudioTrackDto {
  @ApiProperty({ description: 'Language code, e.g. ja, en, bn, hi' })
  @IsString()
  @MaxLength(16)
  language!: string;

  @ApiProperty({ example: 'English Dub' })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({ enum: MediaProvider, default: MediaProvider.GOOGLE_DRIVE })
  @IsOptional()
  @IsEnum(MediaProvider)
  provider?: MediaProvider;

  @ApiPropertyOptional({ description: 'Drive share link or file ID (GOOGLE_DRIVE provider)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driveFileIdOrUrl?: string;

  @ApiPropertyOptional({ description: 'Absolute URL or uploads path (DIRECT_FILE / OBJECT_STORAGE)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @ApiPropertyOptional({ default: 'audio/mp4', description: 'audio/mp4 for .m4a/.aac, audio/mpeg for .mp3' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Optional note such as "AAC 2.0 192k"' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  codec?: string;

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

export class SubtitleTrackDto {
  @ApiProperty({ description: 'Language tag, e.g. "en" or "bn"' })
  @IsString()
  @MaxLength(16)
  language!: string;

  @ApiProperty({ example: 'English' })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiPropertyOptional({ enum: SubtitleFormat, default: SubtitleFormat.VTT })
  @IsOptional()
  @IsEnum(SubtitleFormat)
  format?: SubtitleFormat;

  @ApiPropertyOptional({ description: 'URL of an uploaded .vtt/.srt file' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @ApiPropertyOptional({ description: 'Drive file ID or share URL holding the subtitle file' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  driveFileIdOrUrl?: string;

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
 * A server entry. One MediaSource is one server AND one audio flavour, because
 * a progressive file carries a single audio track — so a Japanese-audio and an
 * English-dub file are two sources, not two tracks of one source.
 */
export class MediaSourceDto {
  @ApiProperty({ example: 'Server 1' })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ enum: MediaProvider })
  @IsEnum(MediaProvider)
  provider!: MediaProvider;

  @ApiProperty({ enum: MediaKind })
  @IsEnum(MediaKind)
  kind!: MediaKind;

  @ApiPropertyOptional({ default: 'ja' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  audioLanguage?: string;

  @ApiPropertyOptional({ default: 'Japanese' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  audioLabel?: string;

  @ApiPropertyOptional({ description: 'HLS master playlist (.m3u8) — HLS provider only' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hlsUrl?: string;

  @ApiPropertyOptional({
    description:
      'EXTERNAL_EMBED provider only. An embed cannot be controlled by our player, so the custom controls are hidden for this source.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  embedUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [MediaVariantDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => MediaVariantDto)
  variants?: MediaVariantDto[];

  @ApiPropertyOptional({ type: [AudioTrackDto], description: 'HLS sources only' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AudioTrackDto)
  audioTracks?: AudioTrackDto[];
}

export class DownloadSourceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ enum: VideoQuality })
  @IsEnum(VideoQuality)
  quality!: VideoQuality;

  @ApiProperty({ enum: MediaKind })
  @IsEnum(MediaKind)
  kind!: MediaKind;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  url!: string;
}

export class CreateEpisodeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  animeId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @ApiProperty({ description: 'Supports decimals for recap/special episodes, e.g. 7.5' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  number!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  @Transform(({ value }) => String(value).trim())
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  airDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasSub?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasDub?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFiller?: boolean;

  @ApiPropertyOptional({ description: 'Seconds from the start. Leave null to hide the Skip Intro button.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  introStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  introEnd?: number;

  @ApiPropertyOptional({ description: 'Seconds from the start. Leave null to hide the Skip Outro button.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  outroStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  outroEnd?: number;

  @ApiPropertyOptional({ enum: PublishStatus })
  @IsOptional()
  @IsEnum(PublishStatus)
  publishStatus?: PublishStatus;

  @ApiPropertyOptional({ type: [MediaSourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => MediaSourceDto)
  mediaSources?: MediaSourceDto[];

  @ApiPropertyOptional({ type: [EpisodeAudioTrackDto], description: 'Separate audio files, any number of languages' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EpisodeAudioTrackDto)
  audioTracks?: EpisodeAudioTrackDto[];

  @ApiPropertyOptional({ type: [SubtitleTrackDto], description: 'Applies to every source of the episode' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SubtitleTrackDto)
  subtitleTracks?: SubtitleTrackDto[];

  @ApiPropertyOptional({ type: [DownloadSourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DownloadSourceDto)
  downloadSources?: DownloadSourceDto[];
}

export class UpdateEpisodeDto extends CreateEpisodeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  declare animeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  declare number: number;
}
