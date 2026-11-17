import type { FastifyInstance } from 'fastify';
import { prisma, getDefaultHospital } from '../db.js';
import { createReadingBody, createDayBody, patchDayBody } from '../validation.js';

/** Persistence: the default hospital, register readings, and saved days (plan + ticks). */
export async function dataRoutes(app: FastifyInstance) {
  app.get('/api/hospital', async () => {
    const h = await getDefaultHospital();
    return h;
  });

  app.post('/api/readings', async (req, reply) => {
    const { numbers, photoRefs } = createReadingBody.parse(req.body);
    const hospital = await getDefaultHospital();
    const reading = await prisma.reading.create({
      data: { hospitalId: hospital.id, numbers, photoRefs: photoRefs ?? undefined },
    });
    reply.code(201);
    return reading;
  });

  app.get<{ Params: { id: string } }>('/api/readings/:id', async (req, reply) => {
    const reading = await prisma.reading.findUnique({ where: { id: req.params.id } });
    if (!reading) return reply.code(404).send({ error: 'reading not found' });
    return reading;
  });

  app.post('/api/days', async (req, reply) => {
    const body = createDayBody.parse(req.body);
    const hospital = await getDefaultHospital();
    const reading = await prisma.reading.findUnique({ where: { id: body.readingId } });
    if (!reading) return reply.code(400).send({ error: 'readingId does not exist' });
    const day = await prisma.day.create({
      data: {
        hospitalId: hospital.id,
        readingId: body.readingId,
        seed: body.seed ?? 'day-2',
        fixes: body.fixes ?? {},
        done: body.done ?? {},
        shocks: body.shocks ?? [],
      },
    });
    reply.code(201);
    return day;
  });

  app.get<{ Params: { id: string } }>('/api/days/:id', async (req, reply) => {
    const day = await prisma.day.findUnique({ where: { id: req.params.id }, include: { reading: true } });
    if (!day) return reply.code(404).send({ error: 'day not found' });
    return day;
  });

  app.patch<{ Params: { id: string } }>('/api/days/:id', async (req, reply) => {
    const body = patchDayBody.parse(req.body);
    const exists = await prisma.day.findUnique({ where: { id: req.params.id } });
    if (!exists) return reply.code(404).send({ error: 'day not found' });
    const day = await prisma.day.update({
      where: { id: req.params.id },
      data: {
        ...(body.seed !== undefined ? { seed: body.seed } : {}),
        ...(body.fixes !== undefined ? { fixes: body.fixes } : {}),
        ...(body.done !== undefined ? { done: body.done } : {}),
        ...(body.shocks !== undefined ? { shocks: body.shocks } : {}),
      },
    });
    return day;
  });
}
