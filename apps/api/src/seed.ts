/* Seed the single hospital + the sample register reading so a fresh DB demos at once. */
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { env } from './env.js';
import { scriptedProvider } from './providers/scripted.js';

async function main() {
  let hospital = await prisma.hospital.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!hospital) {
    hospital = await prisma.hospital.create({
      data: { name: env.hospitalName, baseConfig: {} },
    });
    console.log('Seeded hospital:', hospital.name, `(${hospital.id})`);
  } else {
    console.log('Hospital already present:', hospital.name);
  }

  const existingReading = await prisma.reading.findFirst({ where: { hospitalId: hospital.id } });
  if (!existingReading) {
    const numbers = (await scriptedProvider.read({})) as unknown as Prisma.InputJsonObject;
    const reading = await prisma.reading.create({
      data: { hospitalId: hospital.id, numbers },
    });
    console.log('Seeded sample reading:', reading.id);
  } else {
    console.log('Sample reading already present.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
