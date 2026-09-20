'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { onLogout, useAuthStore } from '@/lib/auth-store';

function SessionBootstrap() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Trades the httpOnly refresh cookie for an in-memory access token on load,
  // which is what restores the session across page refreshes.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Cached queries can hold the signed-in user's data; none may survive logout.
  useEffect(() => onLogout(() => queryClient.clear()), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap />
      {children}
    </QueryClientProvider>
  );
}
