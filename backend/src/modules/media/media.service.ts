import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaProvider, SubtitleFormat } from '@prisma/client';
import { hmacSign, safeEquals } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaProviderRegistry } from './media-provider.registry';
import {
  MediaRef,
  MediaStreamResult,
  OpenStreamOptions,
} from './providers/media-provider.interface';

export type SignedResourceKind = 'variant' | 'subtitle' | 'audio';

export interface SignedUrl {
  url: string;
  expiresAt: number;
}

/**
 * Playback URLs are short-lived and HMAC-signed. That stops the raw Drive file
 * IDs from ever reaching the browser and makes hot-linking our bandwidth
 * impractical, without requiring a login to watch.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly registry: MediaProviderRegistry,
  ) {}

  sign(kind: SignedResourceKind, id: string): SignedUrl {
    const ttl = this.config.values.media.signedUrlTtl;
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const signature = hmacSign(`${kind}:${id}:${expires}`, this.config.values.media.signingSecret);
    const base = this.config.values.publicUrl;
    const prefix = this.config.values.apiPrefix;
    const path = kind === 'variant' ? 'stream' : kind;
    return {
      url: `${base}/${prefix}/media/${path}/${id}?exp=${expires}&sig=${signature}`,
      expiresAt: expires * 1000,
    };
  }

  verify(kind: SignedResourceKind, id: string, exp: string | undefined, sig: string | undefined): void {
    if (!exp || !sig) {
      throw new ForbiddenException('This playback link is missing its signature');
    }
    const expires = Number(exp);
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) {
      throw new ForbiddenException('This playback link has expired. Reload the page.');
    }
    const expected = hmacSign(`${kind}:${id}:${expires}`, this.config.values.media.signingSecret);
    if (!safeEquals(expected, sig)) {
      throw new ForbiddenException('This playback link is not valid');
    }
  }

  async openVariantStream(variantId: string, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const variant = await this.prisma.mediaVariant.findUnique({
      where: { id: variantId },
      include: { mediaSource: true },
    });

    if (!variant || !variant.isActive || !variant.mediaSource.isActive) {
      throw new NotFoundException('This video source is no longer available');
    }

    const adapter = this.registry.get(variant.mediaSource.provider);
    if (!adapter) {
      throw new NotFoundException(
        `Provider ${variant.mediaSource.provider} is delivered directly to the player and is not proxied`,
      );
    }
    if (!adapter.isConfigured()) {
      throw new NotFoundException(
        `The ${variant.mediaSource.provider} provider is not configured on this server yet`,
      );
    }

    const ref: MediaRef = {
      driveFileId: variant.driveFileId,
      directUrl: variant.directUrl,
      mimeType: variant.mimeType,
    };
    return adapter.openStream(ref, options);
  }

  /**
   * Streams a separate audio file (e.g. English-Dub.m4a) with Range support.
   * The player plays it in a hidden <audio> element kept in sync with the
   * video, which is what lets audio switch without the video restarting.
   */
  async openAudioStream(trackId: string, options: OpenStreamOptions): Promise<MediaStreamResult> {
    const track = await this.prisma.audioTrack.findUnique({ where: { id: trackId } });
    if (!track || !track.isActive || !track.episodeId) {
      throw new NotFoundException('This audio track is no longer available');
    }

    const adapter = this.registry.get(track.provider);
    if (!adapter) {
      throw new NotFoundException(`Provider ${track.provider} cannot serve audio files`);
    }
    if (!adapter.isConfigured()) {
      throw new NotFoundException(`The ${track.provider} provider is not configured on this server yet`);
    }

    return adapter.openStream(
      { driveFileId: track.driveFileId, directUrl: track.url, mimeType: track.mimeType ?? 'audio/mp4' },
      options,
    );
  }

  /**
   * Returns subtitle bytes as WebVTT. SRT uploads are converted on the fly so
   * the browser's TextTrack API can consume them without a client-side parser.
   */
  async readSubtitle(trackId: string): Promise<{ body: string; contentType: string }> {
    const track = await this.prisma.subtitleTrack.findUnique({
      where: { id: trackId },
      include: { mediaSource: true },
    });
    if (!track || !track.isActive) {
      throw new NotFoundException('Subtitle track not found');
    }

    const provider = track.driveFileId
      ? MediaProvider.GOOGLE_DRIVE
      : (track.mediaSource?.provider ?? MediaProvider.DIRECT_FILE);

    const adapter = this.registry.get(provider) ?? this.registry.get(MediaProvider.DIRECT_FILE);
    if (!adapter) throw new NotFoundException('No provider can serve this subtitle track');

    const result = await adapter.openStream(
      { driveFileId: track.driveFileId, directUrl: track.url, mimeType: 'text/vtt' },
      {},
    );

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const raw = Buffer.concat(chunks).toString('utf8');

    const body = track.format === SubtitleFormat.SRT ? srtToVtt(raw) : ensureVttHeader(raw);
    return { body, contentType: 'text/vtt; charset=utf-8' };
  }

  providerStatus() {
    return this.registry.status();
  }
}

/** WebVTT needs the WEBVTT header line; some tools emit bare cue lists. */
export function ensureVttHeader(input: string): string {
  const text = input.replace(/^﻿/, '').trimStart();
  return text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`;
}

/**
 * SRT -> WebVTT. The two formats differ only in the header, the comma decimal
 * separator in timestamps, and SRT's numeric cue indices.
 */
export function srtToVtt(input: string): string {
  const body = input
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3})/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body.trim()}\n`;
}
