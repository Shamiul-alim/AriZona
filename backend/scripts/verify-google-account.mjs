/**
 * Verifies the production account state produced by a real Google sign-in:
 * linking, duplicates, role, email normalization and session creation.
 * Reads only; prints masked addresses.
 *
 *   DATABASE_URL=... node scripts/verify-google-account.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const mask = (e) => {
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 2)}***@${d}`;
};

const google = await prisma.user.findMany({
  where: { googleId: { not: null } },
  select: {
    id: true, email: true, username: true, role: true, passwordHash: true,
    emailVerifiedAt: true, createdAt: true, lastLoginAt: true, deletedAt: true, avatarUrl: true,
  },
  orderBy: { createdAt: 'desc' },
});

console.log(`=== Google-linked accounts: ${google.length} ===`);
for (const u of google) {
  console.log({
    email: mask(u.email),
    emailNormalized: u.email === u.email.toLowerCase().trim(),
    username: u.username,
    role: u.role,
    hasLocalPassword: u.passwordHash !== null,
    emailVerified: u.emailVerifiedAt !== null,
    hasAvatar: Boolean(u.avatarUrl),
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    deleted: u.deletedAt !== null,
  });
}

// A duplicate would show up as two rows sharing an address.
const all = await prisma.user.findMany({ select: { email: true } });
const seen = new Map();
for (const { email } of all) {
  const k = email.toLowerCase().trim();
  seen.set(k, (seen.get(k) ?? 0) + 1);
}
const dupes = [...seen.entries()].filter(([, n]) => n > 1);
console.log(`\nDuplicate addresses: ${dupes.length === 0 ? 'NONE' : dupes.map(([e, n]) => `${mask(e)} x${n}`).join(', ')}`);
console.log(`Addresses stored non-normalized: ${all.filter((u) => u.email !== u.email.toLowerCase().trim()).length}`);
console.log(`Total accounts: ${all.length}`);

for (const u of google) {
  const total = await prisma.refreshToken.count({ where: { userId: u.id } });
  const active = await prisma.refreshToken.count({
    where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  console.log(`\nSessions for ${mask(u.email)}: ${active} active / ${total} issued`);
}

await prisma.$disconnect();
