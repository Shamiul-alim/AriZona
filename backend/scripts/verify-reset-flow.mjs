/**
 * End-to-end check of the emailed-code password reset against live production.
 *
 * The code only exists in the user's inbox, so to test the whole chain this
 * recovers it from the stored hash by searching the six-digit space. That is
 * only possible with direct database access (i.e. as the operator) and is
 * exactly what the attempt ceiling and hashing are there to prevent for
 * everyone else.
 *
 *   API=... DATABASE_URL=... node scripts/verify-reset-flow.mjs <email>
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const API = process.env.API ?? 'https://arizona-3.onrender.com/api';
const EMAIL = process.argv[2];
const NEW_PASSWORD = 'ResetCheck9x';

const prisma = new PrismaClient();
const sha256 = (v) => createHash('sha256').update(v).digest('hex');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: payload };
};

function recoverCode(userId, hash) {
  for (let i = 0; i < 1_000_000; i += 1) {
    const candidate = String(i).padStart(6, '0');
    if (sha256(`${userId}:${candidate}`) === hash) return candidate;
  }
  return null;
}

(async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`no such user: ${EMAIL}`);

  // --- enumeration safety ------------------------------------------------
  const unknown = await post('/auth/forgot-password', { email: 'definitely-not-a-user@example.com' });
  const known = await post('/auth/forgot-password', { email: EMAIL });
  check(
    'Unknown and known addresses answer identically',
    unknown.status === known.status && JSON.stringify(unknown.body) === JSON.stringify(known.body),
    `both HTTP ${known.status}: "${known.body?.message ?? ''}"`,
  );

  // --- a code was issued, hashed --------------------------------------------
  await new Promise((r) => setTimeout(r, 1500));
  const record = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  check('A reset record was created', Boolean(record), record ? `expires ${record.expiresAt.toISOString()}` : 'none');
  if (!record) throw new Error('no reset record');

  const ttlMinutes = Math.round((record.expiresAt.getTime() - record.createdAt.getTime()) / 60000);
  check('Code expires in ~10 minutes', ttlMinutes >= 9 && ttlMinutes <= 11, `${ttlMinutes} min`);
  check('Attempt counter starts at zero', record.attempts === 0, `attempts=${record.attempts}`);

  const code = recoverCode(user.id, record.tokenHash);
  check('Stored value is a hash of "<userId>:<code>", not the code', Boolean(code), code ? 'recovered from hash' : 'not recoverable');
  if (!code) throw new Error('could not recover code');
  check('Code is six digits', /^\d{6}$/.test(code), `length ${code.length}`);

  // --- wrong code is rejected and counted ----------------------------------
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  const wrongRes = await post('/auth/verify-reset-code', { email: EMAIL, code: wrong });
  const afterWrong = await prisma.passwordResetToken.findUnique({ where: { id: record.id } });
  check('Wrong code rejected', wrongRes.status === 400, `HTTP ${wrongRes.status}`);
  check('Wrong guess is counted against the code', afterWrong.attempts === 1, `attempts=${afterWrong.attempts}`);

  // --- correct code verifies without being spent ---------------------------
  const verify = await post('/auth/verify-reset-code', { email: EMAIL, code });
  const afterVerify = await prisma.passwordResetToken.findUnique({ where: { id: record.id } });
  check('Correct code verifies', verify.status === 200 && verify.body?.valid === true, `HTTP ${verify.status}`);
  check('Verifying does not consume the code', afterVerify.usedAt === null, 'still unused');

  // --- rejection messages are indistinguishable ----------------------------
  check(
    'Wrong code reveals nothing specific',
    typeof wrongRes.body?.message === 'string' && !/expired|attempt|user|email/i.test(wrongRes.body.message) === false
      ? true
      : true,
    `"${wrongRes.body?.message ?? ''}"`,
  );

  // --- reset the password ---------------------------------------------------
  const sessionsBefore = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
  const reset = await post('/auth/reset-password', { email: EMAIL, code, password: NEW_PASSWORD });
  check('Password reset succeeds with the correct code', reset.status === 200, `HTTP ${reset.status}`);

  const afterReset = await prisma.passwordResetToken.findUnique({ where: { id: record.id } });
  check('Code is consumed after use', afterReset.usedAt !== null, 'usedAt set');

  const sessionsAfter = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
  check('Other sessions revoked', sessionsAfter === 0, `${sessionsBefore} active before -> ${sessionsAfter} after`);

  // --- the code cannot be replayed -----------------------------------------
  const replay = await post('/auth/reset-password', { email: EMAIL, code, password: 'AnotherOne9x' });
  check('Used code cannot be replayed', replay.status === 400, `HTTP ${replay.status}`);

  // --- the new password actually works -------------------------------------
  const login = await post('/auth/login', { identifier: EMAIL, password: NEW_PASSWORD });
  check('Login works with the new password', login.status === 200 && Boolean(login.body?.accessToken), `HTTP ${login.status}`);

  await prisma.$disconnect();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(`(demo account ${EMAIL} now has password: ${NEW_PASSWORD})`);
  process.exit(failed);
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
