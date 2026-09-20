'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { AdminHeader, Banner, Button, Card, Label, adminInput, adminSelect } from '@/components/admin/ui';

interface Placement {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: 'DISPLAY' | 'IN_ARTICLE' | 'IN_FEED' | 'MULTIPLEX' | 'VIDEO';
  adClient: string | null;
  adSlot: string | null;
  format: string | null;
  fullWidthResponsive: boolean;
  isEnabled: boolean;
  order: number;
  config: VideoConfig | null;
}

interface VideoConfig {
  vastTagUrl?: string;
  preRoll?: boolean;
  midRoll?: boolean;
  postRoll?: boolean;
  midRollIntervalSeconds?: number;
  midRollCuePoints?: number[];
  frequencyCapPerHour?: number;
}

/** Google's documented sample tag. Development only — never ship this. */
const SAMPLE_VAST =
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';

export default function AdminAdsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [globalClient, setGlobalClient] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authFetch<Placement[]>('/ads/placements');
      setPlacements(result);
      const existing = result.find((p) => p.adClient)?.adClient;
      if (existing) setGlobalClient(existing);
    } catch {
      setPlacements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (placement: Placement, patch: Partial<Placement>) => {
    setBanner(null);
    const next = { ...placement, ...patch };
    setPlacements((previous) => previous.map((p) => (p.key === placement.key ? next : p)));

    try {
      await authFetch(`/ads/placements/${placement.key}`, {
        method: 'PUT',
        body: {
          name: next.name,
          description: next.description ?? undefined,
          type: next.type,
          adClient: next.adClient ?? undefined,
          adSlot: next.adSlot ?? undefined,
          format: next.format ?? undefined,
          fullWidthResponsive: next.fullWidthResponsive,
          isEnabled: next.isEnabled,
          order: next.order,
          config: next.config ?? undefined,
        },
      });
      setBanner({ tone: 'ok', text: `Saved “${next.name}”.` });
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
      void load();
    }
  };

  const applyClientToAll = async () => {
    const client = globalClient.trim();
    if (!client) return;
    for (const placement of placements.filter((p) => p.type !== 'VIDEO')) {
      await save(placement, { adClient: client });
    }
    setBanner({ tone: 'ok', text: 'Publisher ID applied to every display placement.' });
  };

  const video = placements.find((p) => p.type === 'VIDEO');
  const display = placements.filter((p) => p.type !== 'VIDEO').sort((a, b) => a.order - b.order);

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
      <AdminHeader
        title="Advertising"
        description="Nothing renders until you supply your own identifiers. Each slot can be switched off independently."
      />

      {banner ? <Banner state={banner} /> : null}

      <Card
        title="AdSense publisher ID"
        description="Your ca-pub-… identifier. Set it once and apply it to every display slot."
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1">
            <Label>Publisher ID</Label>
            <input
              value={globalClient}
              onChange={(e) => setGlobalClient(e.target.value)}
              placeholder="ca-pub-0000000000000000"
              className={adminInput}
            />
          </label>
          <Button type="button" onClick={() => void applyClientToAll()}>
            Apply to all display slots
          </Button>
        </div>
      </Card>

      <Card
        title="In-stream video ads (Google IMA)"
        description="Pre-, mid- and post-roll are served through the IMA SDK from a VAST or VMAP tag."
      >
        {video ? (
          <VideoAdEditor placement={video} onSave={save} />
        ) : (
          <p className="text-[13px] text-ink-faint">No video placement is configured on this server.</p>
        )}

        <div className="mt-4 rounded-lg border border-warn/30 bg-warn/8 px-3.5 py-3">
          <p className="text-[12.5px] font-semibold text-warn">Before you enable this, two things worth knowing</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-ink-soft">
            <li>
              • A standard AdSense display account does <strong>not</strong> grant in-stream video inventory. You need a
              Google Ad Manager video ad unit and the corresponding publisher eligibility.
            </li>
            <li>
              • Google&rsquo;s sample tag below is for development only. It serves test creatives and must never be left
              in a production configuration.
            </li>
          </ul>
        </div>
      </Card>

      <Card title="Display placements" description="Every slot the frontend knows how to render.">
        <div className="space-y-2">
          {display.map((placement) => (
            <div
              key={placement.key}
              className={cn(
                'rounded-xl border p-3 transition',
                placement.isEnabled && placement.adSlot ? 'border-ok/30 bg-ok/5' : 'border-line-soft bg-base/50',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">{placement.name}</p>
                  <p className="text-[11.5px] text-ink-faint">
                    <code>{placement.key}</code>
                    {placement.description ? ` — ${placement.description}` : ''}
                  </p>
                </div>

                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={placement.isEnabled}
                    onChange={(e) => void save(placement, { isEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
                  />
                  Enabled
                </label>
              </div>

              <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                <input
                  defaultValue={placement.adClient ?? ''}
                  onBlur={(e) => void save(placement, { adClient: e.target.value.trim() || null })}
                  placeholder="ca-pub-…"
                  aria-label={`Publisher ID for ${placement.name}`}
                  className={adminInput}
                />
                <input
                  defaultValue={placement.adSlot ?? ''}
                  onBlur={(e) => void save(placement, { adSlot: e.target.value.trim() || null })}
                  placeholder="Ad slot ID"
                  aria-label={`Slot ID for ${placement.name}`}
                  className={adminInput}
                />
                <select
                  value={placement.format ?? 'auto'}
                  onChange={(e) => void save(placement, { format: e.target.value })}
                  aria-label={`Format for ${placement.name}`}
                  className={adminSelect}
                >
                  <option value="auto">Auto</option>
                  <option value="rectangle">Rectangle</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                  <option value="fluid">Fluid</option>
                </select>
              </div>

              {placement.isEnabled && !placement.adSlot ? (
                <p className="mt-2 text-[11.5px] text-warn">
                  Enabled but missing a slot ID — this placement will not render.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VideoAdEditor({
  placement,
  onSave,
}: {
  placement: Placement;
  onSave: (placement: Placement, patch: Partial<Placement>) => Promise<void>;
}) {
  const [config, setConfig] = useState<VideoConfig>(placement.config ?? {});
  const [cuePoints, setCuePoints] = useState((placement.config?.midRollCuePoints ?? []).join(', '));

  const commit = (patch: Partial<VideoConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    void onSave(placement, { config: next });
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
        <input
          type="checkbox"
          checked={placement.isEnabled}
          onChange={(e) => void onSave(placement, { isEnabled: e.target.checked })}
          className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
        />
        Enable in-stream video advertising
      </label>

      <label className="block">
        <Label hint="A VAST or VMAP tag from Google Ad Manager.">Ad tag URL</Label>
        <input
          defaultValue={config.vastTagUrl ?? ''}
          onBlur={(e) => commit({ vastTagUrl: e.target.value.trim() })}
          placeholder="https://pubads.g.doubleclick.net/gampad/ads?…"
          className={adminInput}
        />
        <button
          type="button"
          onClick={() => commit({ vastTagUrl: SAMPLE_VAST })}
          className="mt-1.5 text-[12px] font-semibold text-brand-bright transition hover:underline"
        >
          Use Google&rsquo;s sample tag (development only)
        </button>
      </label>

      <div className="flex flex-wrap gap-4">
        {[
          { key: 'preRoll' as const, label: 'Pre-roll' },
          { key: 'midRoll' as const, label: 'Mid-roll' },
          { key: 'postRoll' as const, label: 'Post-roll' },
        ].map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={config[item.key] ?? false}
              onChange={(e) => commit({ [item.key]: e.target.checked })}
              className="h-4 w-4 rounded border-line bg-base accent-[var(--color-brand)]"
            />
            {item.label}
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <Label hint="Comma-separated seconds, e.g. 300, 900">Mid-roll cue points</Label>
          <input
            value={cuePoints}
            onChange={(e) => setCuePoints(e.target.value)}
            onBlur={() =>
              commit({
                midRollCuePoints: cuePoints
                  .split(',')
                  .map((v) => Number(v.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0),
              })
            }
            placeholder="45, 600"
            className={adminInput}
          />
        </label>

        <label className="block">
          <Label hint="Used when no cue points are set.">Fallback interval (s)</Label>
          <input
            type="number"
            min={60}
            max={3600}
            defaultValue={config.midRollIntervalSeconds ?? 600}
            onBlur={(e) => commit({ midRollIntervalSeconds: Number(e.target.value) })}
            className={adminInput}
          />
        </label>

        <label className="block">
          <Label hint="0 means no cap.">Max ads per hour</Label>
          <input
            type="number"
            min={0}
            max={30}
            defaultValue={config.frequencyCapPerHour ?? 4}
            onBlur={(e) => commit({ frequencyCapPerHour: Number(e.target.value) })}
            className={adminInput}
          />
        </label>
      </div>
    </div>
  );
}
