'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { useProject } from '@/components/ProjectProvider';
import { downloadBlob } from '@/lib/dates';
import { exportCalendarCSV, exportProjectJSON } from '@/lib/storage';

const NAV_BASE = [
  { href: '/', label: 'Dashboard' },
  { href: '/gantt', label: 'Gantt' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/tasks', label: 'Project Tasks' },
  { href: '/calendar', label: 'Media Blitz' },
  { href: '/media', label: 'Media Library' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/filming', label: 'Filming' },
  { href: '/profile', label: 'Profile' }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canEdit, canManageUsers, displayName, phone, role, roleLabel, isViewer } = useRole();
  const { data } = useProject();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const NAV = canManageUsers
    ? [...NAV_BASE.slice(0, -1), { href: '/users', label: 'Users' }, NAV_BASE[NAV_BASE.length - 1]]
    : NAV_BASE;

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-surface-600 bg-surface-900/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-5">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="btn-ghost lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold leading-tight sm:text-base">Steam × Diamond</h1>
                <p className="truncate text-[10px] text-ink-dim sm:text-xs">Project Hub</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden items-center gap-2 text-xs text-ink-muted sm:inline-flex">
                <span className="max-w-[160px] truncate" title={phone || displayName}>
                  {phone || displayName}
                </span>
                <span className="badge badge-role">{roleLabel}</span>
              </span>

              <div className="relative">
                <button
                  type="button"
                  className="btn-ghost text-xs sm:text-sm"
                  onClick={() => setExportOpen((v) => !v)}
                >
                  Export
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] py-1 panel">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface-700"
                        onClick={() => {
                          downloadBlob(
                            'steam-diamond-project.json',
                            exportProjectJSON(data),
                            'application/json'
                          );
                          setExportOpen(false);
                        }}
                      >
                        Export project (JSON)
                      </button>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-surface-700"
                        onClick={() => {
                          downloadBlob(
                            'steam-diamond-media-calendar.csv',
                            exportCalendarCSV(data.mediaEvents),
                            'text/csv;charset=utf-8'
                          );
                          setExportOpen(false);
                        }}
                      >
                        Export calendar (CSV)
                      </button>
                    </div>
                  </>
                )}
              </div>

              <UserButton afterSignOutUrl="/sign-in" appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
            </div>
          </div>

          <nav className="scrollbar-thin hidden gap-1 overflow-x-auto pb-2.5 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-tab ${isActive(item.href) ? 'nav-tab-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-surface-600 bg-surface-900 shadow-panel">
            <div className="flex items-center justify-between border-b border-surface-600 p-4">
              <span className="font-bold">Menu</span>
              <button type="button" className="btn-ghost" onClick={() => setMobileOpen(false)}>
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                    isActive(item.href)
                      ? 'bg-amber-400/15 text-amber-300'
                      : 'text-ink-muted hover:bg-surface-700 hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-surface-600 p-4 text-xs text-ink-dim">
              {phone || displayName} · {roleLabel}
              {!canEdit && ' · read-only'}
            </div>
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 sm:px-5 sm:py-7">
        {isViewer && (
          <div className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-300">
            <strong>View only</strong> — you can browse the hub but cannot edit. Contact an admin
            for access.
          </div>
        )}
        {children}
      </main>

      <footer className="border-t border-surface-600 py-5 text-center text-[11px] text-ink-dim">
        Steam Distillery × Diamond House BBQ · Project Hub
      </footer>
    </div>
  );
}
