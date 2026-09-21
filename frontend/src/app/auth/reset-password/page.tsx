import { redirect } from 'next/navigation';

/**
 * Password resets are now driven by a code entered on the forgot-password
 * screen rather than a link landing here. This route is kept so that any stale
 * bookmark or previously delivered email lands somewhere useful instead of on
 * a form that can no longer work.
 */
export default function ResetPasswordPage() {
  redirect('/auth/forgot-password');
}
