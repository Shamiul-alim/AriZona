import { Module } from '@nestjs/common';
import { AdminAnimeService } from './admin-anime.service';
import { AdminController } from './admin.controller';
import { AdminEpisodesService } from './admin-episodes.service';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [AdminController],
  providers: [AdminAnimeService, AdminEpisodesService, AdminUsersService, AdminTaxonomyService],
  exports: [AdminAnimeService, AdminEpisodesService],
})
export class AdminModule {}
