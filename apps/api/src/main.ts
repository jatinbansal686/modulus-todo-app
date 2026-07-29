import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Structured JSON logs. Nest's built-in ConsoleLogger does this now, so pino
    // is not needed to get machine-parseable output.
    logger: new ConsoleLogger({ json: true, colors: false }),

    // Body parsing is taken over manually below. Nest registers body-parser during
    // create(), i.e. ahead of any middleware we add — which meant a malformed JSON
    // body threw before the correlation-id middleware had run, so those errors came
    // back with `requestId: "-"` and could not be traced to a log line.
    bodyParser: false,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const isProduction = config.get('isProduction', { infer: true });

  // Every middleware, prefix and pipe lives in configureApp() so the integration
  // tests boot the exact same pipeline instead of a hand-rolled copy that drifts.
  configureApp(app);

  // Behind Render/Heroku/nginx, TLS terminates at a shared load balancer. Without
  // this, Express reports the *proxy's* address as req.ip for every caller, so the
  // throttler files everyone into one bucket and a per-IP limit silently becomes a
  // global one — two bad password attempts would lock out every user at once.
  const trustProxy = config.get('trustProxy', { infer: true });
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    // A native app sends no Origin header, so `true` covers the mobile client while
    // still refusing arbitrary browser origins. Never '*'.
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Modulus To-Do API')
    .setDescription(
      'Task management API with JWT authentication. Use `POST /api/v1/auth/login`, then paste the returned access token via **Authorize** to exercise the protected endpoints.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .setOpenAPIVersion('3.1.0')
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    {
      swaggerOptions: { persistAuthorization: true },
    },
  );

  // Lets Nest run shutdown hooks so Mongo connections close cleanly on SIGTERM
  // instead of being severed mid-query when the platform recycles the instance.
  app.enableShutdownHooks();

  // Bind to 0.0.0.0, and take the port from the environment. Hardcoding the port or
  // binding to localhost is the single most common first-deploy failure on a PaaS:
  // the platform's port scan finds nothing and marks the deploy failed.
  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(
    `Listening on port ${port} (${isProduction ? 'production' : 'development'})`,
  );
  logger.log(`Swagger UI at /docs`);
}

void bootstrap();
