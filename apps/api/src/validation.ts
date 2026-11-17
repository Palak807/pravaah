import { z } from 'zod';

export const shockSchema = z.object({
  type: z.enum(['accident', 'insuranceSlow', 'roundsLate']),
  at: z.number(),
});

export const fixesSchema = z.record(z.boolean());
export const doneSchema = z.record(z.record(z.boolean()));

// The engine merges over DEFAULTS, so config is accepted as a partial passthrough.
export const cfgSchema = z.record(z.any());

export const optsSchema = z.object({
  seed: z.string().optional(),
  now: z.number().optional(),
  fixes: fixesSchema.optional(),
  done: doneSchema.optional(),
  shocks: z.array(shockSchema).optional(),
});

export const simulateBody = z.object({
  cfg: cfgSchema.optional(),
  opts: optsSchema.optional(),
});

export const riskBody = z.object({
  cfg: cfgSchema.optional(),
  opts: optsSchema.optional(),
  n: z.number().int().min(1).max(50).optional(),
});

export const bestPlanBody = z.object({
  cfg: cfgSchema.optional(),
  opts: optsSchema.optional(),
});

export const askBody = z.object({
  text: z.string().min(1),
  cfg: cfgSchema.optional(),
  seed: z.string().optional(),
  now: z.number().optional(),
  fixes: fixesSchema.optional(),
  done: doneSchema.optional(),
  shocks: z.array(shockSchema).optional(),
});

export const readBody = z.object({
  photoRefs: z.any().optional(),
  images: z.array(z.string()).optional(),
});

export const readingNumbers = z.object({
  wardBeds: z.number(),
  wardOccupied: z.number(),
  icuBeds: z.number(),
  icuOccupied: z.number(),
  fitForDischarge: z.number(),
  insured: z.number(),
  stepDowns: z.array(z.number()),
  plannedAdmissions: z.array(z.number()),
});

export const createReadingBody = z.object({
  numbers: readingNumbers,
  photoRefs: z.any().optional(),
});

export const createDayBody = z.object({
  readingId: z.string(),
  seed: z.string().optional(),
  fixes: fixesSchema.optional(),
  done: doneSchema.optional(),
  shocks: z.array(shockSchema).optional(),
});

export const contactBody = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  message: z.string().min(1).max(5000),
  // Honeypot: real users leave this empty; if a bot fills it, the route drops the message.
  website: z.string().optional(),
});

export const patchDayBody = z.object({
  seed: z.string().optional(),
  fixes: fixesSchema.optional(),
  done: doneSchema.optional(),
  shocks: z.array(shockSchema).optional(),
});
