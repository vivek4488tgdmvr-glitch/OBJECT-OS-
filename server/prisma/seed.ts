import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
async function main() {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) {
    console.log('Seed skipped. Set SEED_EMAIL and SEED_PASSWORD to create a development account.');
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) { console.log('Seed account already exists.'); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email: normalizedEmail, passwordHash,
      memberships: { create: { role: 'OWNER', household: { create: { name: 'My household' } } } }
    }
  });
  console.log(`Created development account for ${normalizedEmail}`);
}
main().finally(() => prisma.$disconnect());
