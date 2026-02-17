import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

async function main() {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const passwordHash = requireEnv('ADMIN_PASSWORD_HASH');

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'admin',
      passwordHash,
      isGuest: false,
    },
    create: {
      email,
      role: 'admin',
      passwordHash,
      isGuest: false,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isGuest: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log('Admin bootstrap successful:', admin);
}

main()
  .catch((error) => {
    console.error('Admin bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });