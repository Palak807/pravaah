import type { FastifyInstance } from 'fastify';
import { contactBody } from '../validation.js';
import { smtpConfigured } from '../env.js';
import { sendContactEmail } from '../mailer.js';

export async function contactRoutes(app: FastifyInstance) {
  app.get('/api/contact/status', async () => ({ enabled: smtpConfigured() }));

  app.post('/api/contact', async (req, reply) => {
    const body = contactBody.parse(req.body);
    // Honeypot filled -> silently accept without sending (bot).
    if (body.website) return { ok: true };
    if (!smtpConfigured()) {
      return reply.code(503).send({ error: 'Email is not configured on the server yet.' });
    }
    try {
      await sendContactEmail({ name: body.name, email: body.email, message: body.message });
      return { ok: true };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'Could not send the message. Please try again later.' });
    }
  });
}
