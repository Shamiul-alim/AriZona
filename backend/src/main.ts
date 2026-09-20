import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfigService);
  const { apiPrefix, port, corsOrigins, isProduction, swaggerEnabled, siteName } = config.values;
  const logger = new Logger('Bootstrap');

  // Static files under /uploads are registered with useStaticAssets below and
  // are unaffected by this prefix. (An `exclude` for 'uploads/(.*)' used to sit
  // here; it also stripped /api from the upload controller, which is why
  // POST /api/uploads/:kind returned 404.)
  app.setGlobalPrefix(apiPrefix);

  app.use(
    helmet({
      // The media proxy streams video to a <video> element on the frontend
      // origin, so a same-origin-only resource policy would block it.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  });

  // Behind nginx/a load balancer, so req.ip reflects the real client.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useStaticAssets(resolve(config.values.storage.localPath), {
    prefix: '/uploads/',
    maxAge: '7d',
    index: false,
  });

  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  if (swaggerEnabled && !isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(`${siteName} API`)
        .setDescription('REST API for the anime streaming platform')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    });
    logger.log(`Swagger UI at http://localhost:${port}/${apiPrefix}/docs`);
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`${siteName} API listening on http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();
