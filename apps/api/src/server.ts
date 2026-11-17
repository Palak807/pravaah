import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { env } from './env.js';
import { engineRoutes } from './routes/engine.js';
import { assistantRoutes } from './routes/assistant.js';
import { dataRoutes } from './routes/data.js';
import { contactRoutes } from './routes/contact.js';

export function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });

  app.register(cors, { origin: true });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: 'validation', issues: err.issues });
      return;
    }
    app.log.error(err as Error);
    const e = err as { statusCode?: number; message?: string };
    reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'internal error' });
  });

  app.get('/api/health', async () => ({ status: 'ok', provider: env.assistantProvider }));

  app.register(engineRoutes);
  app.register(assistantRoutes);
  app.register(dataRoutes);
  app.register(contactRoutes);

  return app;
}

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = buildServer();
  app
    .listen({ port: env.port, host: env.host })
    .then(() => app.log.info(`Nabz API listening on ${env.host}:${env.port}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
