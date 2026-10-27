import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { runtimeConfig } from './config/runtime-config';
import { SafeExceptionFilter } from './common/safe-exception.filter';
import type { NextFunction, Request, Response } from 'express';
export async function createApp(rootModule: Type = AppModule) {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    logger: false,
    forceCloseConnections: true,
  });
  app.set('trust proxy', false);
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new SafeExceptionFilter());
  return app;
}
export async function bootstrap() {
  const config = runtimeConfig();
  const app = await createApp();
  // Nest owns lifecycle hooks. The earlier signal listener bounds their completion.
  let deadline: NodeJS.Timeout | undefined;
  const bound = () => {
    deadline ??= setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', bound);
  process.on('SIGTERM', bound);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    await app.listen(config.port, config.host);
  } catch {
    await app.close();
    throw new Error('API listener startup failed');
  }
  return app;
}
if (require.main === module)
  bootstrap().catch(() => {
    console.error(
      'API startup failed; check runtime configuration and listener availability.',
    );
    process.exitCode = 1;
  });
