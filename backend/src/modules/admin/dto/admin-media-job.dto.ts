import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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
