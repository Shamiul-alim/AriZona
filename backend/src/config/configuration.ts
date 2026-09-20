import { z } from 'zod';

/**
 * Environment contract. Parsed once at boot — a malformed or missing required
 * variable fails fast with a readable message instead of surfacing as a
 * confusing runtime error later.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const intFrom = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFrom(4000),
  API_PREFIX: z.string().default('api'),
  SWAGGER_ENABLED: booleanish.default(true),
  BACKEND_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  SITE_NAME: z.string().default('AniZora'),
  SITE_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_ENABLED: booleanish.default(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_REFRESH_TTL_REMEMBER: z.string().default('90d'),
  BCRYPT_ROUNDS: intFrom(12),

  ADMIN_EMAIL: z.string().default('admin@anizora.local'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('ChangeMe123!'),

  GOOGLE_OAUTH_ENABLED: booleanish.default(false),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().optional().default(''),

  GOOGLE_DRIVE_ENABLED: booleanish.default(false),
  GOOGLE_DRIVE_AUTH_MODE: z.enum(['service_account', 'oauth']).default('service_account'),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional().default(''),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional().default(''),

  MEDIA_SIGNING_SECRET: z.string().min(16, 'MEDIA_SIGNING_SECRET must be at least 16 characters'),
  MEDIA_SIGNED_URL_TTL: intFrom(21600),
  MEDIA_MAX_RANGE_CHUNK: intFrom(8 * 1024 * 1024),

  STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage/uploads'),
  // Site-relative by default: the frontend serves /uploads/* by proxying to the
  // API, so the same URL works in the browser, during SSR, and on any domain.
  STORAGE_PUBLIC_BASE_URL: z.string().default('/uploads'),
  MAX_UPLOAD_SIZE_MB: intFrom(15),

  // Cloudinary — used when STORAGE_DRIVER=cloudinary (free-tier hosting, where
  // the container filesystem is ephemeral). Credentials are backend-only.
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  /** Uploads are grouped under this folder so one account can host several sites. */
  CLOUDINARY_FOLDER: z.string().optional().default('anizora'),

  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),

  MAIL_DRIVER: z.enum(['smtp', 'log']).default('log'),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: intFrom(1025),
  MAIL_SECURE: booleanish.default(false),
  MAIL_USER: z.string().optional().default(''),
  MAIL_PASSWORD: z.string().optional().default(''),
  MAIL_FROM_NAME: z.string().default('AniZora'),
  MAIL_FROM_ADDRESS: z.string().default('no-reply@anizora.local'),

  THROTTLE_TTL: intFrom(60),
  THROTTLE_LIMIT: intFrom(120),
  AUTH_THROTTLE_LIMIT: intFrom(8),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  swaggerEnabled: boolean;
  publicUrl: string;
  corsOrigins: string[];
  siteName: string;
  siteUrl: string;
  redis: { enabled: boolean; url: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
    refreshTtlRemember: string;
  };
  bcryptRounds: number;
  admin: { email: string; username: string; password: string };
  googleOAuth: { enabled: boolean; clientId: string; clientSecret: string; callbackUrl: string };
  drive: {
    enabled: boolean;
    authMode: 'service_account' | 'oauth';
    serviceAccountFile: string;
    serviceAccountJsonBase64: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  media: { signingSecret: string; signedUrlTtl: number; maxRangeChunk: number };
  storage: {
    driver: 'local' | 's3' | 'cloudinary';
    localPath: string;
    publicBaseUrl: string;
    maxUploadBytes: number;
    cloudinary: { cloudName: string; apiKey: string; apiSecret: string; folder: string };
    s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl: string };
  };
  mail: {
    driver: 'smtp' | 'log';
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromName: string;
    fromAddress: string;
  };
  throttle: { ttl: number; limit: number; authLimit: number };
}

export function buildConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    swaggerEnabled: env.SWAGGER_ENABLED,
    publicUrl: env.BACKEND_PUBLIC_URL.replace(/\/$/, ''),
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    siteName: env.SITE_NAME,
    siteUrl: env.SITE_URL.replace(/\/$/, ''),
    redis: { enabled: env.REDIS_ENABLED, url: env.REDIS_URL },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
      refreshTtlRemember: env.JWT_REFRESH_TTL_REMEMBER,
    },
    bcryptRounds: env.BCRYPT_ROUNDS,
    admin: { email: env.ADMIN_EMAIL, username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    googleOAuth: {
      enabled: env.GOOGLE_OAUTH_ENABLED && !!env.GOOGLE_OAUTH_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_OAUTH_CALLBACK_URL,
    },
    drive: {
      enabled: env.GOOGLE_DRIVE_ENABLED,
      authMode: env.GOOGLE_DRIVE_AUTH_MODE,
      serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE,
      serviceAccountJsonBase64: env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
    },
    media: {
      signingSecret: env.MEDIA_SIGNING_SECRET,
      signedUrlTtl: env.MEDIA_SIGNED_URL_TTL,
      maxRangeChunk: env.MEDIA_MAX_RANGE_CHUNK,
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      localPath: env.STORAGE_LOCAL_PATH,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, ''),
      maxUploadBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
        folder: env.CLOUDINARY_FOLDER,
      },
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL,
      },
    },
    mail: {
      driver: env.MAIL_DRIVER,
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_SECURE,
      user: env.MAIL_USER,
      password: env.MAIL_PASSWORD,
      fromName: env.MAIL_FROM_NAME,
      fromAddress: env.MAIL_FROM_ADDRESS,
    },
    throttle: { ttl: env.THROTTLE_TTL, limit: env.THROTTLE_LIMIT, authLimit: env.AUTH_THROTTLE_LIMIT },
  };
}

export const CONFIG_KEY = 'app';

export default () => ({ [CONFIG_KEY]: buildConfig(validateEnv(process.env)) });
