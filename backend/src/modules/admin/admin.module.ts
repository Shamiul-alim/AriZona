import { Module } from '@nestjs/common';
import { AdminAnimeService } from './admin-anime.service';
import { AdminController } from './admin.controller';
import { AdminEpisodesService } from './admin-episodes.service';
import { AdminSeasonsService } from './admin-seasons.service';
import { AdminMediaJobsService } from './admin-media-jobs.service';
import { MediaWorkerController } from './media-worker.controller';
import { MediaWorkerGuard } from './media-worker.guard';
import { MasterUploadService } from './master-upload.service';
import { MediaWorkerPresenceService } from './media-worker-presence.service';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [AdminController, MediaWorkerController],
  providers: [
    AdminAnimeService,
    AdminEpisodesService,
    AdminUsersService,
    AdminTaxonomyService,
    AdminSeasonsService,
    AdminMediaJobsService,
    MediaWorkerGuard,
    MasterUploadService,
    MediaWorkerPresenceService,
  ],
  exports: [AdminAnimeService, AdminEpisodesService],
})
export class AdminModule {}
