import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaProviderRegistry } from './media-provider.registry';
import { MediaService } from './media.service';
import { DirectFileProvider } from './providers/direct-file.provider';
import { GoogleDriveProvider } from './providers/google-drive.provider';

@Global()
@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaProviderRegistry, GoogleDriveProvider, DirectFileProvider],
  exports: [MediaService, MediaProviderRegistry],
})
export class MediaModule {}
