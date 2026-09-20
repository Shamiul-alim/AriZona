import type { UserRole } from './types';

const STAFF_ROLES: ReadonlySet<UserRole> = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Only same-site paths are honoured as a return target. "//evil.example" is a
 * protocol-relative URL to another site, and auth pages would loop.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.startsWith('/auth/')) return null;
  return raw;
}

/**
 * Where to send someone right after they sign in.
 *
 * Based purely on the role the server returned — never on the email address.
 *  * An explicit return path wins (e.g. the page that asked them to sign in),
 *    except that a non-staff user is never sent into /admin.
 *  * Otherwise staff land on the dashboard and everyone else on the homepage.
 */
export function postLoginPath(role: UserRole, returnTo: string | null | undefined): string {
  const target = safeReturnPath(returnTo);
  const isStaff = STAFF_ROLES.has(role);

  if (target && target !== '/') {
    if (target.startsWith('/admin') && !isStaff) return '/';
    return target;
  }
  return isStaff ? '/admin' : '/';
}
