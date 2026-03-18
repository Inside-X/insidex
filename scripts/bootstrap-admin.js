import prisma from '../src/lib/prisma.js';

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const email = requireEnv('ADMIN_EMAIL').trim().toLowerCase();
  const passwordHash = requireEnv('ADMIN_PASSWORD_HASH');

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: 'admin',
      isGuest: false,
    },
    update: {
      passwordHash,
      role: 'admin',
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

  console.log(user);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Admin bootstrap failed: ${message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});