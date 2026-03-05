import { PrismaClient } from '@prisma/client';
import { seedCatalogueV1 } from './seed.catalogue-v1.js';

const prisma = new PrismaClient();

async function main() {
  const force = process.env.SEED_FORCE === '1';
  await seedCatalogueV1({ prisma, force, log: (...args) => console.log(...args) });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });