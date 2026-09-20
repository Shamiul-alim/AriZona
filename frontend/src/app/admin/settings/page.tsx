'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { AdminHeader, Banner, Button, Card, adminInput } from '@/components/admin/ui';

interface Setting {
  key: string;
  value: unknown;
  group: string;
  label: string | null;
  description: string | null;
  isPublic: boolean;
}

interface Group {
  group: string;
  settings: Setting[];
}

export default function AdminSettingsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<Group[]>('/settings');
      setGroups(result);
      setDraft(Object.fromEntries(result.flatMap((g) => g.settings.map((s) => [s.key, s.value]))));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAll = async () => {
    setSaving(true);
    setBanner(null);
    try {
      await authFetch('/settings', { method: 'PUT', body: { values: draft } });
      setBanner({ tone: 'ok', text: 'Settings saved.' });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader title="Site settings" description="Values the frontend reads at runtime. Public settings are exposed to the browser.">
        <Button onClick={() => void saveAll()} disabled={saving}>
          {saving ? 'Saving…' : 'Save all'}
        </Button>
      </AdminHeader>

      {banner ? <Banner state={banner} /> : null}

      {groups.map((group) => (
        <Card key={group.group} title={group.group.charAt(0).toUpperCase() + group.group.slice(1)}>
          <div className="space-y-3">
            {group.settings.map((setting) => {
              const value = draft[setting.key];
              const isBoolean = typeof setting.value === 'boolean';
              const isNumber = typeof setting.value === 'number';

              return (
                <div key={setting.key} className="flex flex-wrap items-center gap-3 rounded-lg bg-base/50 px-3 py-2.5">
                  <div className="min-w-48 flex-1">
                    <p className="text-[13px] font-medium text-ink">{setting.label ?? setting.key}</p>
                    <p className="text-[11px] text-ink-faint">
                      <code>{setting.key}</code>
                      {setting.isPublic ? ' · public' : ' · server only'}
                    </p>
                  </div>

                  {isBoolean ? (
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-soft">
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => setDraft((d) => ({ ...d, [setting.key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                      />
                      {value ? 'On' : 'Off'}
                    </label>
                  ) : (
                    <input
                      type={isNumber ? 'number' : 'text'}
                      value={String(value ?? '')}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [setting.key]: isNumber ? Number(e.target.value) : e.target.value,
                        }))
                      }
                      aria-label={setting.label ?? setting.key}
                      className={`${adminInput} w-full sm:w-72`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
