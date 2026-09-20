import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdsModule } from './modules/ads/ads.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AnimeModule } from './modules/anime/anime.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CommunityModule } from './modules/community/community.module';
import { ContactModule } from './modules/contact/contact.module';
import { EpisodesModule } from './modules/episodes/episodes.module';
import { HealthModule } from './modules/health/health.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { MailModule } from './modules/mail/mail.module';
import { ManaModule } from './modules/mana/mana.module';
import { MediaModule } from './modules/media/media.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RequestsModule } from './modules/requests/requests.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorageModule } from './modules/storage/storage.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';
import { UsersModule } from './modules/users/users.module';
import { WatchModule } from './modules/watch/watch.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // A single limiter. Stricter limits for sensitive routes (login,
        // register, password reset) are set per-route with @Throttle.
        throttlers: [
          { name: 'default', ttl: config.values.throttle.ttl * 1000, limit: config.values.throttle.limit },
        ],
      }),
    }),

    // Global infrastructure modules
    MailModule,
    ManaModule,
    MediaModule,
    StorageModule,
    SettingsModule,
    AnalyticsModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AnimeModule,
    EpisodesModule,
    TaxonomyModule,
    WatchModule,
    WatchlistModule,
    RatingsModule,
    CommentsModule,
    ReportsModule,
    CommunityModule,
    LeaderboardModule,
    RequestsModule,
    ContactModule,
    AdsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: authenticate, then authorise, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
