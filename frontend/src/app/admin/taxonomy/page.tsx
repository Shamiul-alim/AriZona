'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authFetch } from '@/lib/auth-store';
import { AdminHeader, Banner, Button, Card, Label, adminInput } from '@/components/admin/ui';

interface Entity {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  animeCount?: number;
  _count?: { anime: number };
}

type Kind = 'genres' | 'studios' | 'producers';

export default function AdminTaxonomyPage() {
  const [genres, setGenres] = useState<Entity[]>([]);
  const [studios, setStudios] = useState<Entity[]>([]);
  const [producers, setProducers] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s, p] = await Promise.all([
        apiFetch<Entity[]>('/genres'),
        apiFetch<Entity[]>('/studios'),
        apiFetch<Entity[]>('/producers'),
      ]);
      setGenres(g);
      setStudios(s);
      setProducers(p);
    } catch {
      /* leave lists empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (kind: Kind, body: Record<string, unknown>) => {
    try {
      await authFetch(`/admin/${kind}`, { method: 'POST', body });
      setBanner({ tone: 'ok', text: 'Created.' });
      void load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not create.' });
    }
  };

  const remove = async (kind: Kind, entity: Entity) => {
    if (!window.confirm(`Delete “${entity.name}”?`)) return;
    try {
      await authFetch(`/admin/${kind}/${entity.id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setBanner({ tone: 'error', text: e instanceof Error ? e.message : 'Could not delete.' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-56 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader title="Genres, studios & producers" description="The vocabulary the catalogue and filters are built on." />

      {banner ? <Banner state={banner} /> : null}

      <EntitySection
        title="Genres"
        description="Used by filtering, genre pages and the recommendation engine. A genre still assigned to a title cannot be deleted."
        entities={genres}
        countOf={(e) => e.animeCount ?? 0}
        withColour
        onCreate={(body) => create('genres', body)}
        onDelete={(entity) => remove('genres', entity)}
      />

      <EntitySection
        title="Studios"
        description="Deleting a studio clears the reference on its titles; nothing is removed from the catalogue."
        entities={studios}
        countOf={(e) => e._count?.anime ?? 0}
        onCreate={(body) => create('studios', body)}
        onDelete={(entity) => remove('studios', entity)}
      />

      <EntitySection
        title="Producers"
        entities={producers}
        countOf={(e) => e._count?.anime ?? 0}
        onCreate={(body) => create('producers', body)}
        onDelete={(entity) => remove('producers', entity)}
      />
    </div>
  );
}

function EntitySection({
  title,
  description,
  entities,
  countOf,
  withColour,
  onCreate,
  onDelete,
}: {
  title: string;
  description?: string;
  entities: Entity[];
  countOf: (entity: Entity) => number;
  withColour?: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<void>;
  onDelete: (entity: Entity) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#7c5cff');

  return (
    <Card title={title} description={description}>
      <div className="flex flex-wrap gap-1.5">
        {entities.map((entity) => (
          <span
            key={entity.id}
            className="group/e inline-flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pl-2.5 pr-1 text-[12.5px]"
            style={withColour && entity.color ? { background: `${entity.color}1f`, color: entity.color } : undefined}
          >
            {entity.name}
            <span className="text-[10.5px] opacity-60">{countOf(entity)}</span>
            <button
              type="button"
              onClick={() => void onDelete(entity)}
              aria-label={`Delete ${entity.name}`}
              className="grid h-5 w-5 place-items-center rounded text-ink-faint opacity-0 transition hover:bg-danger/20 hover:text-danger focus:opacity-100 group-hover/e:opacity-100"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        {entities.length === 0 ? <p className="text-[13px] text-ink-faint">Nothing defined yet.</p> : null}
      </div>

      <div className="mt-4 border-t border-line-soft pt-4">
        <Label>Add new</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label={`New ${title}`}
            className={`${adminInput} min-w-40 flex-1`}
          />
          {withColour ? (
            <input
              type="color"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              aria-label="Colour"
              className="h-10 w-14 cursor-pointer rounded-lg border border-line-soft bg-base p-1"
            />
          ) : null}
          <Button
            type="button"
            onClick={() => {
              if (!name.trim()) return;
              void onCreate({ name: name.trim(), ...(withColour ? { color: colour } : {}) });
              setName('');
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
