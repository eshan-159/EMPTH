import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { registerAgentRoutes } from './routes/agent.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true
});

await app.register(multipart, {
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

await registerAgentRoutes(app);

app.get('/health', async () => ({ ok: true }));

try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
  app.log.info(`Backend listening on http://127.0.0.1:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
