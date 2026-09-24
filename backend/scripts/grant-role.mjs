/**
 * Grants a role to an account, and records the change in the activity log.
 *
 * This exists because the admin API deliberately cannot do it: changing a role
 * needs SUPER_ADMIN, and the service additionally refuses to grant a role equal
 * to or above the actor's own — so the first SUPER_ADMIN beyond the seeded one
 * has to be created by an operator with database access. That restriction is
 * correct and is not being weakened; this is the out-of-band path for the
 * site's owner.
 *
 *   DATABASE_URL=... node scripts/grant-role.mjs <email> <ROLE> [--apply]
 *
 * Without --apply it only reports what it would do.
 */
import { PrismaClient } from '@prisma/client';

const ROLES = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'];
const [email, role] = process.argv.slice(2);
const apply = process.argv.includes('--apply');

if (!email || !ROLES.includes(role)) {
  console.error(`usage: node scripts/grant-role.mjs <email> <${ROLES.join('|')}> [--apply]`);
  process.exit(1);
}

const prisma = new PrismaClient();
const mask = (value) => {
  const [name, domain] = value.split('@');
  return `${name.slice(0, 6)}…${name.slice(-2)}@${domain}`;
};

const user = await prisma.user.findUnique({
  where: { email: email.trim().toLowerCase() },
  select: { id: true, email: true, username: true, role: true, status: true, deletedAt: true },
});

if (!user) {
  console.error(`No account for ${mask(email)}`);
  process.exit(1);
}
if (user.deletedAt) {
  console.error(`${mask(user.email)} is deleted; refusing.`);
  process.exit(1);
}

console.log(`${mask(user.email)} (${user.username}): ${user.role} -> ${role}${apply ? '' : '   [dry run]'}`);

if (apply && user.role !== role) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role } }),
    // Same shape the app uses elsewhere, so the change is visible in Audit Log.
    prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'admin.user.role_changed',
        entityType: 'User',
        entityId: user.id,
        metadata: { from: user.role, to: role, via: 'scripts/grant-role.mjs', by: 'operator (database access)' },
      },
    }),
  ]);
  const after = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  console.log(`applied — role is now ${after.role}`);
}

await prisma.$disconnect();
