/**
 * Replaces development passwords with strong random ones.
 *
 * A database copied up from development carries its seed passwords with it —
 * here a shared `Password123` across every demo account, one of which is a
 * MODERATOR. Those are published knowledge, so they cannot be left reachable
 * on a public URL.
 *
 * Writes the new credentials to a file OUTSIDE version control and prints only
 * the file path, never the passwords themselves.
 *
 * Usage (from backend/):
 *   DATABASE_URL=... node scripts/harden-demo-accounts.mjs --out <path>
 */
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const outIndex = process.argv.indexOf('--out');
const OUT = outIndex > -1 ? process.argv[outIndex + 1] : 'admin-credentials.local.txt';

/** Readable but high-entropy: ~130 bits, no ambiguous characters. */
function strongPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true, role: true },
    orderBy: { role: 'desc' },
  });

  const lines = [
    'AniZora — production credentials',
    `Generated ${new Date().toISOString()}`,
    '',
    'Keep this file private. It is excluded from git.',
    'Change these from the profile/admin screens after first sign-in.',
    '',
  ];

  const staff = [];
  const demo = [];

  for (const user of users) {
    const password = strongPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, ROUNDS) },
    });

    const row = `${user.role.padEnd(12)} ${user.username.padEnd(12)} ${user.email.padEnd(26)} ${password}`;
    (user.role === 'USER' ? demo : staff).push(row);
    console.log(`  rotated: ${user.username} (${user.role})`);
  }

  lines.push('STAFF ACCOUNTS', ...staff, '', 'DEMO ACCOUNTS (ordinary users)', ...demo, '');
  await writeFile(OUT, lines.join('\n'), 'utf8');

  console.log(`\n${users.length} account(s) rotated.`);
  console.log(`Credentials written to: ${OUT}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
