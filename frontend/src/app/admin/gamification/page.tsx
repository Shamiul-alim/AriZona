'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { AdminHeader, Banner, Button, Card, Label, adminInput } from '@/components/admin/ui';

interface ManaRule {
  id: string;
  event: string;
  amount: number;
  dailyLimit: number;
  description: string | null;
  isActive: boolean;
}

interface Rank {
  id: string;
  name: string;
  requiredMana: number;
  icon: string | null;
  color: string | null;
  description: string | null;
  _count: { users: number };
}

function label(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ');
}

export default function AdminGamificationPage() {
  const [rules, setRules] = useState<ManaRule[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [newRank, setNewRank] = useState({ name: '', requiredMana: '', icon: '', color: '#7c5cff', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, k] = await Promise.all([
        authFetch<ManaRule[]>('/admin/mana-rules'),
        authFetch<Rank[]>('/admin/ranks'),
      ]);
      setRules(r);
      setRanks(k);
    } catch {
      setRules([]);
      setRanks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRule = async (rule: ManaRule, patch: Partial<ManaRule>) => {
    const next = { ...rule, ...patch };
    setRules((previous) => previous.map((r) => (r.id === rule.id ? next : r)));
    try {
      await authFetch('/admin/mana-rules', {
        method: 'PUT',
        body: { event: next.event, amount: next.amount, dailyLimit: next.dailyLimit },
      });
      setBanner({ tone: 'ok', text: `Updated ${label(next.event)}.` });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
      void load();
    }
  };

  const createRank = async () => {
    if (!newRank.name.trim() || !newRank.requiredMana) return;
    try {
      await authFetch('/admin/ranks', {
        method: 'POST',
        body: {
          name: newRank.name.trim(),
          requiredMana: Number(newRank.requiredMana),
          icon: newRank.icon.trim() || undefined,
          color: newRank.color,
          description: newRank.description.trim() || undefined,
        },
      });
      setNewRank({ name: '', requiredMana: '', icon: '', color: '#7c5cff', description: '' });
      void load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not create the rank.' });
    }
  };

  const removeRank = async (rank: Rank) => {
    if (!window.confirm(`Delete the “${rank.name}” rank? Its ${rank._count.users} members drop to the rank below.`)) return;
    try {
      await authFetch(`/admin/ranks/${rank.id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not delete the rank.' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skeleton h-72 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Mana & ranks"
        description="Tune the economy without a deploy. Daily caps are what stop the system being farmable."
      />

      {banner ? <Banner state={banner} /> : null}

      <Card title="Mana rules" description="Set an amount to 0 to switch an event off. A daily limit of 0 means unlimited.">
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-base/50 px-3 py-2.5">
              <div className="min-w-44 flex-1">
                <p className="text-[13px] font-medium text-ink">{label(rule.event)}</p>
                {rule.description ? <p className="text-[11px] text-ink-faint">{rule.description}</p> : null}
              </div>

              <label className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-ink-faint">Amount</span>
                <input
                  type="number"
                  defaultValue={rule.amount}
                  onBlur={(e) => void saveRule(rule, { amount: Number(e.target.value) })}
                  aria-label={`Amount for ${rule.event}`}
                  className={`${adminInput} w-20`}
                />
              </label>

              <label className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-ink-faint">Daily cap</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={rule.dailyLimit}
                  onBlur={(e) => void saveRule(rule, { dailyLimit: Number(e.target.value) })}
                  aria-label={`Daily limit for ${rule.event}`}
                  className={`${adminInput} w-20`}
                />
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Rank ladder" description="Ranks are cosmetic. Members are promoted automatically when their Mana crosses a threshold.">
        <div className="space-y-2">
          {ranks.map((rank) => (
            <div key={rank.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-base/50 px-3 py-2.5">
              <span className="text-[18px]" aria-hidden="true">
                {rank.icon}
              </span>
              <div className="min-w-40 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: rank.color ?? undefined }}>
                  {rank.name}
                </p>
                <p className="text-[11px] text-ink-faint">
                  {rank.requiredMana.toLocaleString()} Mana · {rank._count.users} members
                  {rank.description ? ` · ${rank.description}` : ''}
                </p>
              </div>
              {rank.requiredMana > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => void removeRank(rank)}>
                  Delete
                </Button>
              ) : (
                <span className="text-[11.5px] text-ink-faint">Starting rank</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line-soft pt-4">
          <Label>Add a rank</Label>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_7rem_5rem_5rem_auto]">
            <input
              value={newRank.name}
              onChange={(e) => setNewRank({ ...newRank, name: e.target.value })}
              placeholder="Rank name"
              aria-label="Rank name"
              className={adminInput}
            />
            <input
              type="number"
              min={1}
              value={newRank.requiredMana}
              onChange={(e) => setNewRank({ ...newRank, requiredMana: e.target.value })}
              placeholder="Mana"
              aria-label="Required Mana"
              className={adminInput}
            />
            <input
              value={newRank.icon}
              onChange={(e) => setNewRank({ ...newRank, icon: e.target.value })}
              placeholder="Icon"
              aria-label="Icon"
              className={adminInput}
            />
            <input
              type="color"
              value={newRank.color}
              onChange={(e) => setNewRank({ ...newRank, color: e.target.value })}
              aria-label="Colour"
              className="h-10 w-full cursor-pointer rounded-lg border border-line-soft bg-base p-1"
            />
            <Button type="button" onClick={() => void createRank()}>
              Add
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
