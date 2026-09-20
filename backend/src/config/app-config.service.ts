import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, CONFIG_KEY } from './configuration';

/** Typed accessor so nothing in the app reads `process.env` directly. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get values(): AppConfig {
    return this.config.getOrThrow<AppConfig>(CONFIG_KEY);
  }

  get isProduction(): boolean {
    return this.values.isProduction;
  }
}
