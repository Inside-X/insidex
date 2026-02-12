import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Minimal seed placeholder. Add real inserts once models are defined.
  console.log('Prisma seed executed: no model data inserted yet.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });