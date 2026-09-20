import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from 'src/common/decorators';
import { StorageService, UploadKind } from './storage.service';

const KINDS: UploadKind[] = ['poster', 'banner', 'thumbnail', 'avatar', 'subtitle'];

@ApiTags('uploads')
@Controller('uploads')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post(':kind')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload a poster, banner, thumbnail, avatar or subtitle file' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!KINDS.includes(kind as UploadKind)) {
      throw new BadRequestException(`kind must be one of: ${KINDS.join(', ')}`);
    }
    if (!file) throw new BadRequestException('No file was uploaded');
    return this.storage.save(file, kind as UploadKind);
  }
}
