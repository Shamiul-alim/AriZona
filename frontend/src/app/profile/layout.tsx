import type { Metadata } from 'next';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { RequireAuth } from '@/components/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'My Zone',
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
        <ProfileTabs />
        {children}
      </div>
    </RequireAuth>
  );
}
