import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateProgressDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  episodeId!: string;

  @ApiProperty({ description: 'Current playback position in seconds' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  positionSeconds!: number;

  @ApiPropertyOptional({ description: 'Total duration reported by the player' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;
}

export class RecordOpenDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  episodeId!: string;
}
