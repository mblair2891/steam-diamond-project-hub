'use client';

import Link from 'next/link';
import { useProject } from '@/components/ProjectProvider';
import KeyDatesPanel from '@/components/KeyDatesPanel';
import { useRole } from '@/hooks/useRole';
import { daysFromToday, formatDate, formatDateShort } from '@/lib/dates';

export default function DashboardPage() {
  const { data, getKeysDate, getOpenDate } = useProject();
  const { canEdit } = useRole();
  const keys = getKeysDate();
  const open = getOpenDate();
  const daysKeys = daysFromToday(keys);
  const daysOpen = daysFromToday(open);
  const openTasks = data.tasks.filter((t) => !t.done).length;
  const pendingAppr = data.approvals.filter(
    (a) => a.status === 'pending' || a.status === 'review'
  ).length;

  const urgent = [...data.tasks]
    .filter((t) => !t.done)
    .sort((a, b) => {
      const p = { High: 0, Medium: 1, Low: 2 } as const;
      return (p[a.priority] ?? 3) - (p[b.priority] ?? 3) || a.due.localeCompare(b.due);
    })
    .slice(0, 5);

  const upcoming = [...data.mediaEvents]
    .filter((e) => daysFromToday(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Dashboard</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">{data.projectName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tasks" className="btn-secondary btn-sm">
            Tasks
          </Link>
          <Link href="/calendar" className="btn-secondary btn-sm">
            Media Blitz
          </Link>
          <Link href="/gantt" className="btn-primary btn-sm">
            View Gantt
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          {
            v: daysKeys >= 0 ? daysKeys : `−${Math.abs(daysKeys)}`,
            l: `Days to Keys (${formatDateShort(keys)})`
          },
          {
            v: daysOpen >= 0 ? daysOpen : `−${Math.abs(daysOpen)}`,
            l: 'Days to Opening'
          },
          { v: openTasks, l: 'Open Tasks' },
          {
            v: pendingAppr,
            l: `Pending Approvals · ${data.mediaAssets.length} assets`
          }
        ].map((m) => (
          <div key={m.l} className="metric-card">
            <div className="text-3xl font-bold tracking-tight">{m.v}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              {m.l}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <KeyDatesPanel editable={canEdit} />
        <div className="panel p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide">Priority Tasks</h3>
            <Link href="/tasks" className="btn-ghost btn-sm">
              View all
            </Link>
          </div>
          {urgent.length === 0 ? (
            <div className="empty-state">No open tasks</div>
          ) : (
            urgent.map((t) => (
              <div key={t.id} className="data-row !px-0">
                <div className="text-sm font-medium">{t.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`badge badge-${t.priority.toLowerCase()}`}>{t.priority}</span>
                  <span className="text-[11px] text-ink-dim">Due {formatDate(t.due)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">Upcoming Media Blitz</h3>
          <Link href="/calendar" className="btn-ghost btn-sm">
            Calendar
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.length === 0 ? (
            <div className="empty-state col-span-full">No upcoming media events</div>
          ) : (
            upcoming.map((e) => (
              <div key={e.id} className="panel-inset p-3">
                <div className="text-[11px] font-semibold text-amber-300">{formatDate(e.date)}</div>
                <div className="mt-0.5 text-sm">{e.title}</div>
                <div className="mt-1 text-[11px] capitalize text-ink-dim">
                  {e.type} · {e.channel}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
