'use client';

import { create } from 'zustand';
import { apiFetch, ApiError } from './api';
import type { AuthResponse, AuthUser } from './types';

/**
 * Session state.
 *
 * The access token is held in memory only — never localStorage — so an XSS bug
 * cannot simply read it out of storage. Persistence comes from the httpOnly
 * refresh cookie the backend sets, which JavaScript cannot touch; on boot the
 * app calls /auth/refresh to trade that cookie for a fresh access token.
 */

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';
  error: string | null;

  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (payload: AuthResponse) => void;
  refresh: () => Promise<string | null>;
  patchUser: (patch: Partial<AuthUser>) => void;
  clearError: () => void;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Bumped on every logout. A refresh that was already in flight when the user
 * signed out must not write its result back and silently sign them in again.
 */
let sessionGeneration = 0;

const logoutListeners = new Set<() => void>();
/** Lets other layers (e.g. the query cache) drop user data on sign-out. */
export function onLogout(listener: () => void): () => void {
  logoutListeners.add(listener);
  return () => logoutListeners.delete(listener);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  error: null,

  setSession: (payload) => {
    set({ user: payload.user, accessToken: payload.accessToken, status: 'authenticated', error: null });
  },

  bootstrap: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    const token = await get().refresh();
    if (!token) set({ status: 'anonymous', user: null, accessToken: null });
  },

  refresh: async () => {
    // Several components can mount at once; only one network refresh happens.
    if (refreshInFlight) return refreshInFlight;

    const generation = sessionGeneration;
    refreshInFlight = (async () => {
      try {
        const result = await apiFetch<AuthResponse>('/auth/refresh', {
          method: 'POST',
          body: {},
          credentials: 'include',
        });
        if (generation !== sessionGeneration) return null;
        set({ user: result.user, accessToken: result.accessToken, status: 'authenticated' });
        return result.accessToken;
      } catch {
        if (generation === sessionGeneration) set({ user: null, accessToken: null, status: 'anonymous' });
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  login: async (identifier, password, rememberMe) => {
    set({ error: null });
    try {
      const result = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { identifier, password, rememberMe },
        credentials: 'include',
      });
      get().setSession(result);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not sign in. Please try again.';
      set({ error: message });
      throw error;
    }
  },

  register: async (email, username, password) => {
    set({ error: null });
    try {
      const result = await apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { email, username, password },
        credentials: 'include',
      });
      get().setSession(result);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not create your account.';
      set({ error: message });
      throw error;
    }
  },

  logout: async () => {
    sessionGeneration += 1;
    // Clear local state first so the UI flips immediately, then revoke the
    // refresh token server-side (which also deletes the httpOnly cookie).
    set({ user: null, accessToken: null, status: 'anonymous', error: null });
    refreshInFlight = null;
    try {
      await apiFetch('/auth/logout', { method: 'POST', body: {}, credentials: 'include' });
    } catch {
      // A failed revoke must not trap the user in a signed-in UI.
    }
    logoutListeners.forEach((listener) => listener());
  },

  patchUser: (patch) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...patch } });
  },

  clearError: () => set({ error: null }),
}));

/**
 * Authenticated fetch that transparently retries once after refreshing an
 * expired access token, so a 15-minute token never surfaces as a user-visible
 * error mid-session.
 */
export async function authFetch<T>(
  path: string,
  options: Parameters<typeof apiFetch>[1] = {},
): Promise<T> {
  const { accessToken, refresh } = useAuthStore.getState();

  try {
    return await apiFetch<T>(path, { ...options, token: accessToken, credentials: 'include' });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      const fresh = await refresh();
      if (fresh) {
        return apiFetch<T>(path, { ...options, token: fresh, credentials: 'include' });
      }
    }
    throw error;
  }
}
