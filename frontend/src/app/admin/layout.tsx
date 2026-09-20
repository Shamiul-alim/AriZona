import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth role="MODERATOR">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-6 px-4 py-6 md:px-6 lg:flex-row">
        <AdminNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}
