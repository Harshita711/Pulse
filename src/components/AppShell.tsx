'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/apiClient';
import { CurrentUser } from '@/lib/useCurrentUser';

// Home is the attention feed / "Since you last checked" -- Pulse's actual
// front door, not a generic dashboard tab (Addendum 2 Section C).
const SECTIONS = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/watchlists', label: 'Watchlists', icon: ListIcon },
  { href: '/portfolio', label: 'Portfolio', icon: WalletIcon },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/settings', label: 'Settings', icon: GearIcon },
] as const;

export function AppShell({ user, children }: { user: CurrentUser | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <LeftRail user={user} />
      <MobileTopBar />
      {/* sm:pl-56 clears the left rail; pb-24 clears the bottom tab bar on mobile */}
      <main className="pb-24 sm:pb-8 sm:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</div>
      </main>
      <BottomTabBar />
    </div>
  );
}

function MobileTopBar() {
  return (
    <header className="flex items-center gap-2 border-b border-ink-600 bg-ink-900 px-4 py-3 sm:hidden">
      <span className="h-2 w-2 rounded-full bg-signal" />
      <span className="font-sans text-lg font-semibold tracking-tight">pulse</span>
    </header>
  );
}

function LeftRail({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await api.post('/auth/logout');
    router.replace('/login');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-ink-600 bg-ink-900 sm:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
        <span className="h-2 w-2 rounded-full bg-signal" />
        <span className="font-sans text-lg font-semibold tracking-tight">pulse</span>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {SECTIONS.map((s) => {
          const active = pathname === s.href || pathname?.startsWith(`${s.href}/`);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm transition-colors ${
                active ? 'bg-ink-700 text-signal' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
              }`}
            >
              <s.icon active={active} />
              {s.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-600 px-3 py-4">
        {user && <p className="truncate px-3 pb-2 text-xs text-ink-400">{user.name}</p>}
        <button
          onClick={handleLogout}
          className="w-full rounded px-3 py-2 text-left text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex h-safe-bottom-nav border-t border-ink-600 bg-ink-900 pb-safe sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname?.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            // 44x44 minimum touch target (Addendum 2 Section D6)
            className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          >
            <s.icon active={active} />
            <span className={`text-[10px] ${active ? 'text-signal' : 'text-ink-400'}`}>{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type IconProps = { active?: boolean };
const strokeFor = (active?: boolean) => (active ? '#5DB85D' : '#8B9490');

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeFor(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function ListIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeFor(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function WalletIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeFor(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1" fill={strokeFor(active)} />
    </svg>
  );
}
function SearchIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeFor(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function GearIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeFor(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64c.63-.26 1.03-.87 1.03-1.55V3a2 2 0 1 1 4 0v.09c0 .68.4 1.29 1.03 1.55.68.26 1.44.13 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.47.43-.6 1.19-.34 1.87.26.63.87 1.03 1.55 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.29.4-1.55 1.03Z" />
    </svg>
  );
}
