import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** The single hospital for this pass. Created by the seed; fetched lazily otherwise. */
export async function getDefaultHospital() {
  const existing = await prisma.hospital.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  const { env } = await import('./env.js');
  return prisma.hospital.create({ data: { name: env.hospitalName, baseConfig: {} } });
}
