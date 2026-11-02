import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
// Dependency injection keeps the HTTP application independent of server startup.
export function createApp(db, logging = true, { corsOrigins = [], driverCache, broker, updates } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: corsOrigins,
    methods: ['GET', 'PUT', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  if (logging)
    app.use(
      pinoHttp({
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url?.split('?')[0],
          }),
        },
      }),
    );
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', createApiRouter(db, driverCache, broker, updates));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
