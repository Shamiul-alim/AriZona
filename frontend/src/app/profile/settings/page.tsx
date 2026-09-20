'use client';

import { useEffect, useState } from 'react';
import { authFetch, useAuthStore } from '@/lib/auth-store';
import { SUBTITLE_SIZES, usePlayerPreferences } from '@/components/player/usePlayerPreferences';
import { cn } from '@/lib/utils';

interface AccountPreferences {
  titlePreference: 'ENGLISH' | 'JAPANESE';
  preferredAudio: string | null;
  preferredSubtitle: string | null;
  autoplayNext: boolean;
  autoSkipIntro: boolean;
}

type Banner = { tone: 'ok' | 'error'; text: string } | null;

export default function SettingsPage() {
  const { user, patchUser, logout } = useAuthStore();
  const { preferences, update: updateLocalPreferences, reset: resetLocalPreferences } = usePlayerPreferences();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [account, setAccount] = useState<AccountPreferences | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [profileState, setProfileState] = useState<Banner>(null);
  const [prefState, setPrefState] = useState<Banner>(null);
  const [passwordState, setPasswordState] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setUsername(user.username);
  }, [user]);

  useEffect(() => {
    void authFetch<AccountPreferences & { bio: string | null }>('/users/me')
      .then((me) => {
        setAccount({
          titlePreference: me.titlePreference,
          preferredAudio: me.preferredAudio,
          preferredSubtitle: me.preferredSubtitle,
          autoplayNext: me.autoplayNext,
          autoSkipIntro: me.autoSkipIntro,
        });
        setBio(me.bio ?? '');
      })
      .catch(() => undefined);
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProfileState(null);
    try {
      const updated = await authFetch<{ username: string; displayName: string | null }>('/users/me', {
        method: 'PATCH',
        body: { username: username.trim(), displayName: displayName.trim(), bio: bio.trim() },
      });
      patchUser({ username: updated.username, displayName: updated.displayName });
      setProfileState({ tone: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setProfileState({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save your profile.' });
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async (patch: Partial<AccountPreferences>) => {
    if (!account) return;
    const next = { ...account, ...patch };
    setAccount(next);
    setPrefState(null);

    // Mirror into local player preferences so the change is immediate.
    if (patch.autoplayNext !== undefined) updateLocalPreferences({ autoplayNext: patch.autoplayNext });
    if (patch.autoSkipIntro !== undefined) updateLocalPreferences({ autoSkipIntro: patch.autoSkipIntro });
    if (patch.preferredSubtitle !== undefined) {
      updateLocalPreferences({ subtitleLanguage: patch.preferredSubtitle ?? 'off' });
    }
    if (patch.preferredAudio !== undefined) {
      updateLocalPreferences({ audioLanguage: patch.preferredAudio ?? 'ja' });
    }

    try {
      await authFetch('/users/me/preferences', { method: 'PATCH', body: patch });
      setPrefState({ tone: 'ok', text: 'Preferences saved.' });
    } catch {
      setPrefState({ tone: 'error', text: 'Could not save preferences to your account.' });
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPasswordState(null);
    try {
      await authFetch('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      setPasswordState({ tone: 'ok', text: 'Password changed. Other sessions have been signed out.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      setPasswordState({ tone: 'error', text: e instanceof Error ? e.message : 'Could not change your password.' });
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    try {
      await authFetch('/auth/logout-all', { method: 'POST' });
    } finally {
      await logout();
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile */}
      <section className="card-surface p-5">
        <h2 className="text-[15px] font-bold text-ink">Profile</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">How you appear to other members.</p>

        <form onSubmit={saveProfile} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none focus:border-brand/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
              placeholder="Optional"
              className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="A line or two about what you watch."
              className="w-full resize-y rounded-lg border border-line-soft bg-base px-3.5 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/60"
            />
            <span className="mt-1 block text-right text-[11px] tabular-nums text-ink-faint">{bio.length}/500</span>
          </label>

          <Banner state={profileState} />

          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-lg bg-brand px-5 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
          >
            Save profile
          </button>
        </form>
      </section>

      {/* Playback preferences */}
      {account ? (
        <section className="card-surface p-5">
          <h2 className="text-[15px] font-bold text-ink">Playback &amp; display</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Stored on your account, so they follow you to other devices.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Title language</span>
              <div className="flex gap-1.5">
                {(['ENGLISH', 'JAPANESE'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void savePreferences({ titlePreference: value })}
                    aria-pressed={account.titlePreference === value}
                    className={cn(
                      'rounded-lg px-3.5 py-2 text-[13px] font-medium transition',
                      account.titlePreference === value
                        ? 'bg-brand text-white'
                        : 'bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink',
                    )}
                  >
                    {value === 'ENGLISH' ? 'English' : 'Japanese'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Preferred audio</span>
                <select
                  value={account.preferredAudio ?? 'ja'}
                  onChange={(e) => void savePreferences({ preferredAudio: e.target.value })}
                  className="h-11 w-full rounded-lg border border-line-soft bg-base px-3 text-[14px] text-ink outline-none focus:border-brand/60"
                >
                  <option value="ja">Japanese (SUB)</option>
                  <option value="en">English (DUB)</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Preferred subtitles</span>
                <select
                  value={account.preferredSubtitle ?? 'en'}
                  onChange={(e) => void savePreferences({ preferredSubtitle: e.target.value })}
                  className="h-11 w-full rounded-lg border border-line-soft bg-base px-3 text-[14px] text-ink outline-none focus:border-brand/60"
                >
                  <option value="en">English</option>
                  <option value="bn">Bangla</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>

            <Toggle
              label="Autoplay the next episode"
              hint="Starts the next episode automatically when one finishes."
              checked={account.autoplayNext}
              onChange={(value) => void savePreferences({ autoplayNext: value })}
            />

            <Toggle
              label="Skip intros automatically"
              hint="Only applies to episodes that have intro markers configured."
              checked={account.autoSkipIntro}
              onChange={(value) => void savePreferences({ autoSkipIntro: value })}
            />

            <Banner state={prefState} />
          </div>
        </section>
      ) : null}

      {/* Local player settings */}
      <section className="card-surface p-5">
        <h2 className="text-[15px] font-bold text-ink">This browser</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Volume, quality and subtitle styling are stored locally, not on your account.
        </p>

        <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
          <Row label="Volume" value={`${Math.round(preferences.volume * 100)}%`} />
          <Row label="Preferred quality" value={preferences.quality} />
          <Row label="Playback speed" value={`${preferences.playbackRate}×`} />
          <Row
            label="Subtitle size"
            value={SUBTITLE_SIZES.find((size) => size.value === preferences.subtitleStyle.size)?.label ?? 'Medium'}
          />
        </dl>

        <button
          type="button"
          onClick={resetLocalPreferences}
          className="mt-4 h-10 rounded-lg border border-line px-4 text-[13px] font-semibold text-ink-soft transition hover:bg-white/6"
        >
          Reset player settings
        </button>
      </section>

      {/* Security */}
      <section className="card-surface p-5">
        <h2 className="text-[15px] font-bold text-ink">Security</h2>

        <form onSubmit={changePassword} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none focus:border-brand/60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-line-soft bg-base px-3.5 text-[14px] text-ink outline-none focus:border-brand/60"
            />
            <span className="mt-1 block text-[11.5px] text-ink-faint">
              At least 8 characters with upper case, lower case and a number.
            </span>
          </label>

          <Banner state={passwordState} />

          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-lg bg-brand px-5 text-[13.5px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
          >
            Change password
          </button>
        </form>

        <div className="mt-6 border-t border-line-soft pt-5">
          <h3 className="text-[13.5px] font-semibold text-ink">Sign out everywhere</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
            Ends every active session on every device, including this one.
          </p>
          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            className="mt-3 h-10 rounded-lg border border-danger/40 px-4 text-[13px] font-semibold text-danger transition hover:bg-danger/10"
          >
            Sign out of all devices
          </button>
        </div>
      </section>
    </div>
  );
}

function Banner({ state }: { state: Banner }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={cn(
        'rounded-lg px-3 py-2 text-[13px]',
        state.tone === 'ok' ? 'bg-ok/12 text-ok' : 'bg-danger/12 text-danger',
      )}
    >
      {state.text}
    </p>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition hover:bg-white/4"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-faint">{hint}</span>
      </span>
      <span
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-white/20')}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-base px-3 py-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="font-medium text-ink-soft">{value}</dd>
    </div>
  );
}
