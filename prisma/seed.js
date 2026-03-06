import { PrismaClient } from '@prisma/client';
import { seedCatalogueV1 } from './seed.catalogue-v1.js';

const prisma = new PrismaClient();

async function main() {
  await seedCatalogueV1({ prisma, log: (...args) => console.log(...args) });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });