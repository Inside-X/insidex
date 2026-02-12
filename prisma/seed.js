import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed minimal Prisma: connexion réussie (aucune donnée insérée).');
}

main()
  .catch((error) => {
    console.error('Erreur de seed Prisma:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });