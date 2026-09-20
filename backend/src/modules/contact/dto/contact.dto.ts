import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactCategory, ContactStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => String(value).trim())
  name!: string;

  @ApiProperty()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(200)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(({ value }) => String(value).trim())
  subject!: string;

  @ApiProperty({ enum: ContactCategory })
  @IsEnum(ContactCategory)
  category!: ContactCategory;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  @Transform(({ value }) => String(value).trim())
  message!: string;
}

export class UpdateContactDto {
  @ApiProperty({ enum: ContactStatus })
  @IsEnum(ContactStatus)
  status!: ContactStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
