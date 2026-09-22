'use client';

import Link from 'next/link';
import { SmartImage as Image } from '@/components/ui/SmartImage';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchTerm } from '@/lib/search';
import { apiFetch, qs } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { AnimeCard, GenreRef, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';

const BROWSE_LINKS = [
  { href: '/browse?sort=updated', label: 'Recently Updated' },
  { href: '/browse?sort=added', label: 'Recently Added' },
  { href: '/browse?sort=views', label: 'Most Viewed' },
  { href: '/browse?sort=score', label: 'Top Rated' },
  { href: '/browse?status=UPCOMING', label: 'Upcoming' },
  { href: '/browse?status=ONGOING', label: 'Ongoing' },
  { href: '/browse?status=COMPLETED', label: 'Completed' },
  { href: '/browse?language=SUB', label: 'Subbed' },
  { href: '/browse?language=DUB', label: 'Dubbed' },
];

const TYPE_LINKS = [
  { value: 'TV', label: 'TV' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'TV_SPECIAL', label: 'TV Special' },
  { value: 'MUSIC', label: 'Music' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, logout } = useAuthStore();

  const [genres, setGenres] = useState<GenreRef[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiFetch<GenreRef[]>('/genres')
      .then(setGenres)
      .catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close every transient surface on navigation.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      // A menu closes only when the press lands outside EVERY menu area. The
      // account menu used to be missing here, so pressing "Sign out" closed the
      // menu on mousedown and the click never reached the button.
      const target = event.target as Node;
      const insideMenu = navRef.current?.contains(target) || accountRef.current?.contains(target);
      if (!insideMenu) setOpenMenu(null);
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Debounced type-ahead search. One character is a real search; only an
  // empty or whitespace-only query is skipped.
  useEffect(() => {
    const term = searchTerm(query);
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Short queries fire more often, so an older, slower response ("a") must
    // not land on top of a newer one ("an"). Only the latest query may commit.
    let stale = false;
    const timer = setTimeout(() => {
      apiFetch<Paginated<AnimeCard>>(`/anime${qs({ q: term, limit: 6 })}`)
        .then((res) => {
          if (!stale) setResults(res.data);
        })
        .catch(() => {
          if (!stale) setResults([]);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleLogout = useCallback(async () => {
    setOpenMenu(null);
    await logout();
    // Leave any account-only page and drop server-rendered data fetched while
    // signed in.
    router.replace('/');
    router.refresh();
  }, [logout, router]);

  const submitSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const term = searchTerm(query);
      if (!term) return;
      router.push(`/browse${qs({ q: term })}`);
      setSearchOpen(false);
    },
    [query, router],
  );

  const toggleMenu = (name: string) => setOpenMenu((current) => (current === name ? null : name));

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled ? 'glass shadow-[0_8px_32px_-16px_rgb(0_0_0/0.9)]' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 md:px-6">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>

        {/* Desktop navigation */}
        <nav ref={navRef} className="hidden flex-1 items-center gap-0.5 lg:flex" aria-label="Main">
          <NavLink href="/" active={pathname === '/'}>
            Home
          </NavLink>

          <DropdownTrigger label="Genres" open={openMenu === 'genres'} onClick={() => toggleMenu('genres')}>
            <div className="grid max-h-[60vh] w-[34rem] grid-cols-3 gap-0.5 overflow-y-auto p-2">
              {genres.map((genre) => (
                <Link
                  key={genre.slug}
                  href={`/genres/${genre.slug}`}
                  className="truncate rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/8 hover:text-ink"
                >
                  {genre.name}
                </Link>
              ))}
              {genres.length === 0 ? (
                <span className="col-span-3 px-3 py-2 text-[13px] text-ink-faint">No genres yet.</span>
              ) : null}
            </div>
          </DropdownTrigger>

          <DropdownTrigger label="Types" open={openMenu === 'types'} onClick={() => toggleMenu('types')}>
            <div className="grid w-52 gap-0.5 p-2">
              {TYPE_LINKS.map((t) => (
                <Link
                  key={t.value}
                  href={`/browse${qs({ type: t.value })}`}
                  className="rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/8 hover:text-ink"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </DropdownTrigger>

          <DropdownTrigger label="Browse" open={openMenu === 'browse'} onClick={() => toggleMenu('browse')}>
            <div className="grid w-60 gap-0.5 p-2">
              {BROWSE_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/8 hover:text-ink"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 h-px bg-white/8" />
              <Link
                href="/az"
                className="rounded-lg px-3 py-2 text-[13px] text-ink-soft transition hover:bg-white/8 hover:text-ink"
              >
                A-Z List
              </Link>
            </div>
          </DropdownTrigger>

          <NavLink href="/community" active={pathname.startsWith('/community')}>
            Community
          </NavLink>
          <NavLink href="/leaderboard" active={pathname.startsWith('/leaderboard')}>
            Leaderboard
          </NavLink>
          <NavLink href="/random" active={false}>
            Random
          </NavLink>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1.5 lg:flex-none">
          {/* Search */}
          <div ref={searchRef} className="relative">
            <form onSubmit={submitSearch} className="flex items-center">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search anime…"
                aria-label="Search anime"
                className={cn(
                  'h-9 rounded-full border border-line-soft bg-surface/80 pl-9 pr-3 text-[13px] text-ink outline-none transition-all placeholder:text-ink-faint focus:border-brand/60 focus:bg-surface',
                  'w-36 focus:w-56 sm:w-44 sm:focus:w-72',
                )}
              />
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 h-4 w-4 text-ink-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" strokeLinecap="round" />
              </svg>
            </form>

            {searchOpen && searchTerm(query) ? (
              <div className="absolute right-0 top-11 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
                {searching ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-faint">Searching…</p>
                ) : results.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-ink-faint">No titles match “{query}”.</p>
                ) : (
                  <>
                    <ul className="max-h-[22rem] overflow-y-auto py-1">
                      {results.map((anime) => (
                        <li key={anime.id}>
                          <Link
                            href={`/anime/${anime.slug}`}
                            className="flex items-center gap-3 px-3 py-2 transition hover:bg-white/6"
                          >
                            <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-surface-2">
                              {anime.posterUrl ? (
                                <Image src={anime.posterUrl} alt="" fill sizes="40px" className="object-cover" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-ink">{anime.title}</span>
                              <span className="block text-[11px] text-ink-faint">
                                {anime.type} · {anime.releaseYear ?? '—'} · ★ {anime.score.toFixed(1)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/browse${qs({ q: query.trim() })}`}
                      className="block border-t border-line-soft px-4 py-2.5 text-center text-[12px] font-semibold text-brand-bright transition hover:bg-white/5"
                    >
                      See all results
                    </Link>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Account */}
          {status === 'authenticated' && user ? (
            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => toggleMenu('account')}
                className="flex h-9 items-center gap-2 rounded-full border border-line-soft bg-surface/80 pl-1 pr-2.5 transition hover:border-brand/50"
                aria-label="Account menu"
              >
                <span className="relative h-7 w-7 overflow-hidden rounded-full bg-surface-3">
                  {user.avatarUrl ? (
                    <Image src={user.avatarUrl} alt="" fill sizes="28px" className="object-cover" />
                  ) : null}
                </span>
                <span className="hidden max-w-24 truncate text-[13px] font-medium text-ink sm:block">
                  {user.displayName ?? user.username}
                </span>
              </button>

              {openMenu === 'account' ? (
                <div className="absolute right-0 top-11 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl">
                  <div className="border-b border-line-soft px-3.5 py-2.5">
                    <p className="truncate text-[13px] font-semibold text-ink">{user.displayName ?? user.username}</p>
                    <p className="text-[11px] text-accent">{user.mana.toLocaleString()} Mana</p>
                  </div>
                  <MenuLink href="/profile">My Zone</MenuLink>
                  <MenuLink href="/profile/watchlist">My List</MenuLink>
                  <MenuLink href="/profile/history">Watch History</MenuLink>
                  <MenuLink href="/profile/settings">Settings</MenuLink>
                  {user.role !== 'USER' ? (
                    <>
                      <div className="my-1 h-px bg-white/8" />
                      <MenuLink href="/admin">Admin Dashboard</MenuLink>
                    </>
                  ) : null}
                  <div className="my-1 h-px bg-white/8" />
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="w-full px-3.5 py-2 text-left text-[13px] text-danger transition hover:bg-white/6"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : status !== 'anonymous' ? (
            // Session still resolving: reserve the space instead of flashing
            // "Sign in" at people who are signed in.
            <span className="hidden h-9 w-40 sm:block" aria-hidden="true" />
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link
                href="/auth/login"
                className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold text-ink-soft transition hover:bg-white/8 hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-white transition hover:bg-brand-bright"
              >
                Sign up
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-white/8 lg:hidden"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="glass border-t border-line-soft lg:hidden">
          <nav className="max-h-[70vh] overflow-y-auto px-4 py-3" aria-label="Mobile">
            <MobileLink href="/">Home</MobileLink>
            <MobileLink href="/az">A-Z List</MobileLink>
            <MobileLink href="/community">Community</MobileLink>
            <MobileLink href="/leaderboard">Leaderboard</MobileLink>
            <MobileLink href="/random">Random</MobileLink>
            <MobileLink href="/request">Request Anime</MobileLink>

            <p className="mt-3 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Browse</p>
            {BROWSE_LINKS.map((link) => (
              <MobileLink key={link.href} href={link.href}>
                {link.label}
              </MobileLink>
            ))}

            <p className="mt-3 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Genres</p>
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
              {genres.map((genre) => (
                <Link
                  key={genre.slug}
                  href={`/genres/${genre.slug}`}
                  className="rounded-full bg-surface-2 px-3 py-1 text-[12px] text-ink-soft transition hover:bg-surface-3"
                >
                  {genre.name}
                </Link>
              ))}
            </div>

            {status === 'authenticated' ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="mt-3 block w-full rounded-lg border border-line px-4 py-2.5 text-center text-[13px] font-semibold text-danger"
              >
                Sign out
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/auth/login" className="rounded-lg border border-line px-4 py-2.5 text-center text-[13px] font-semibold text-ink">
                  Sign in
                </Link>
                <Link href="/auth/register" className="rounded-lg bg-brand px-4 py-2.5 text-center text-[13px] font-semibold text-white">
                  Sign up
                </Link>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
        active ? 'text-ink' : 'text-ink-soft hover:bg-white/6 hover:text-ink',
      )}
    >
      {children}
    </Link>
  );
}

function DropdownTrigger({
  label,
  open,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
          open ? 'bg-white/8 text-ink' : 'text-ink-soft hover:bg-white/6 hover:text-ink',
        )}
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-11 z-50 animate-fade-up overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block px-3.5 py-2 text-[13px] text-ink-soft transition hover:bg-white/6 hover:text-ink">
      {children}
    </Link>
  );
}

function MobileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2.5 text-[14px] text-ink-soft transition hover:bg-white/6 hover:text-ink"
    >
      {children}
    </Link>
  );
}
