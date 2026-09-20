import { Injectable, Logger } from '@nestjs/common';
import { MediaProvider } from '@prisma/client';
import { MediaProviderAdapter } from './providers/media-provider.interface';
import { DirectFileProvider } from './providers/direct-file.provider';
import { GoogleDriveProvider } from './providers/google-drive.provider';

/**
 * Maps a MediaProvider enum value to the adapter that can serve it.
 *
 * HLS and EXTERNAL_EMBED have no adapter on purpose: their URLs are handed
 * straight to the browser, so nothing is proxied through us.
 */
@Injectable()
export class MediaProviderRegistry {
  private readonly logger = new Logger(MediaProviderRegistry.name);
  private readonly adapters = new Map<MediaProvider, MediaProviderAdapter>();

  constructor(drive: GoogleDriveProvider, direct: DirectFileProvider) {
    this.adapters.set(MediaProvider.GOOGLE_DRIVE, drive);
    this.adapters.set(MediaProvider.DIRECT_FILE, direct);
    // Object storage is HTTP(S) addressable, so it reuses the direct adapter.
    this.adapters.set(MediaProvider.OBJECT_STORAGE, direct);
  }

  get(provider: MediaProvider): MediaProviderAdapter | null {
    return this.adapters.get(provider) ?? null;
  }

  /** True when playback for this provider flows through our streaming proxy. */
  isProxied(provider: MediaProvider): boolean {
    return this.adapters.get(provider)?.proxied ?? false;
  }

  isConfigured(provider: MediaProvider): boolean {
    return this.adapters.get(provider)?.isConfigured() ?? false;
  }

  /** Reported by the admin dashboard so the operator can see what is live. */
  status(): Array<{ provider: MediaProvider; proxied: boolean; configured: boolean }> {
    return Object.values(MediaProvider).map((provider) => {
      const adapter = this.adapters.get(provider);
      return {
        provider,
        proxied: adapter?.proxied ?? false,
        configured: adapter ? adapter.isConfigured() : true,
      };
    });
  }
}
