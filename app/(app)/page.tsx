'use client';

import Link from 'next/link';
import { useProject } from '@/components/ProjectProvider';
import KeyDatesPanel from '@/components/KeyDatesPanel';
import { useRole } from '@/hooks/useRole';
import { daysFromToday, formatDate, formatDateShort } from '@/lib/dates';
import { documentNeedsReview, type Task } from '@/lib/types';

function MyTaskRow({ t }: { t: Task }) {
  const d = daysFromToday(t.due);
  let urgency = 'border-surface-600 bg-surface-950/40';
  let label = d === 0 ? 'Due today' : d > 0 ? `${d} day${d === 1 ? '' : 's'} left` : `${Math.abs(d)}d overdue`;
  let labelClass = 'text-ink-dim';

  if (!t.done && d < 0) {
    urgency = 'border-red-500/40 bg-red-500/10';
    labelClass = 'text-red-300 font-semibold';
  } else if (!t.done && d <= 7) {
    urgency = 'border-amber-400/40 bg-amber-400/10';
    labelClass = 'text-amber-300 font-semibold';
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${urgency}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-sm font-medium ${t.done ? 'line-through opacity-60' : ''}`}>
            {t.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`badge badge-${t.priority.toLowerCase()}`}>{t.priority}</span>
            <span className="text-[11px] text-ink-dim">Due {formatDate(t.due)}</span>
            {t.dependsOnId && (
              <span className="text-[11px] text-ink-dim">Has dependency</span>
            )}
          </div>
        </div>
        {!t.done && <span className={`shrink-0 text-xs ${labelClass}`}>{label}</span>}
        {t.done && <span className="badge badge-complete">Done</span>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, getKeysDate, getOpenDate } = useProject();
  const { canEdit, user, displayName } = useRole();
  const keys = getKeysDate();
  const open = getOpenDate();
  const daysKeys = daysFromToday(keys);
  const daysOpen = daysFromToday(open);
  const openTasks = data.tasks.filter((t) => !t.done).length;
  const pendingAppr = data.approvals.filter(
    (a) => a.status === 'pending' || a.status === 'review'
  ).length;
  const docsNeedReview = (data.reviewDocuments || []).filter(documentNeedsReview).length;

  const myTasks = data.tasks
    .filter((t) => t.assigneeId && user?.id && t.assigneeId === user.id)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));

  const myOpen = myTasks.filter((t) => !t.done);
  const myOverdue = myOpen.filter((t) => daysFromToday(t.due) < 0);
  const myDueSoon = myOpen.filter((t) => {
    const d = daysFromToday(t.due);
    return d >= 0 && d <= 7;
  });

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
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            {data.projectName}
            {displayName ? ` · Hi, ${displayName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tasks" className="btn-secondary btn-sm">
            Tasks
          </Link>
          <Link href="/documents" className="btn-secondary btn-sm">
            Documents
            {docsNeedReview > 0 && (
              <span className="badge badge-needs-review ml-0.5">{docsNeedReview}</span>
            )}
          </Link>
          <Link href="/floor-plan" className="btn-secondary btn-sm">
            Floor Plan
          </Link>
          <Link href="/calendar" className="btn-secondary btn-sm">
            Media Blitz
          </Link>
          <Link href="/gantt" className="btn-primary btn-sm">
            View Gantt
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
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
            l: `Pending Approvals · ${data.mediaAssets.length} cloud assets`
          },
          {
            v: docsNeedReview,
            l: 'Docs need review'
          }
        ].map((m) => (
          <div key={m.l} className="metric-card">
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold tracking-tight">{m.v}</div>
              {m.l === 'Docs need review' && docsNeedReview > 0 && (
                <span className="badge badge-needs-review">Needs Review</span>
              )}
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              {m.l}
            </div>
          </div>
        ))}
      </div>

      {/* Personal assigned tasks */}
      <div className="panel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">My assigned tasks</h3>
            <p className="mt-0.5 text-[11px] text-ink-dim">
              {myOpen.length} open
              {myOverdue.length > 0 ? ` · ${myOverdue.length} overdue` : ''}
              {myDueSoon.length > 0 ? ` · ${myDueSoon.length} due within 7 days` : ''}
            </p>
          </div>
          <Link href="/tasks" className="btn-ghost btn-sm">
            All tasks
          </Link>
        </div>
        {myTasks.length === 0 ? (
          <div className="empty-state !py-6">
            No tasks assigned to you yet. Editors can assign tasks on the Tasks page.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {myTasks.slice(0, 8).map((t) => (
              <MyTaskRow key={t.id} t={t} />
            ))}
          </div>
        )}
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
                  {t.assigneeName && (
                    <span className="badge badge-role">{t.assigneeName}</span>
                  )}
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
