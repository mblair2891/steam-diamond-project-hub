'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useRole } from '@/hooks/useRole';
import { daysFromToday, formatDate, toISODate, uid } from '@/lib/dates';
import { upsertTaskWithCascade } from '@/lib/tasks';
import type { Priority, Task } from '@/lib/types';

const empty = (): Task => ({
  id: '',
  title: '',
  priority: 'Medium',
  due: toISODate(new Date()),
  startDate: toISODate(new Date()),
  durationDays: 7,
  done: false,
  notes: '',
  category: 'General',
  assigneeId: null,
  assigneeName: null,
  dependsOnId: null
});

function dueBadge(due: string, done: boolean) {
  if (done) return null;
  const d = daysFromToday(due);
  if (d < 0) {
    return <span className="badge border border-red-500/40 bg-red-500/20 text-red-300">Overdue {Math.abs(d)}d</span>;
  }
  if (d === 0) {
    return <span className="badge border border-red-500/40 bg-red-500/20 text-red-300">Due today</span>;
  }
  if (d <= 7) {
    return <span className="badge border border-amber-400/40 bg-amber-400/20 text-amber-300">Due in {d}d</span>;
  }
  return <span className="text-[11px] text-ink-dim">{d}d left</span>;
}

export default function TasksPage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const { users, nameFor } = useAssignableUsers();
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<Task>(empty());

  const tasks = useMemo(() => {
    let list = [...data.tasks];
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(qq) ||
          (t.notes || '').toLowerCase().includes(qq) ||
          (t.category || '').toLowerCase().includes(qq) ||
          (t.assigneeName || '').toLowerCase().includes(qq)
      );
    }
    if (priority !== 'all') list = list.filter((t) => t.priority === priority);
    if (status === 'open') list = list.filter((t) => !t.done);
    if (status === 'done') list = list.filter((t) => t.done);
    if (assigneeFilter === 'unassigned') list = list.filter((t) => !t.assigneeId);
    else if (assigneeFilter !== 'all') list = list.filter((t) => t.assigneeId === assigneeFilter);
    return list.sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));
  }, [data.tasks, q, priority, status, assigneeFilter]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const assignee = users.find((u) => u.id === form.assigneeId);
    const next: Task = {
      ...form,
      id: form.id || uid('t'),
      title: form.title.trim(),
      assigneeId: form.assigneeId || null,
      assigneeName: form.assigneeId ? assignee?.displayName || form.assigneeName || null : null,
      dependsOnId: form.dependsOnId || null,
      durationDays: form.durationDays && form.durationDays > 0 ? form.durationDays : 7
    };
    setData((d) => ({
      ...d,
      tasks: upsertTaskWithCascade(d.tasks, next)
    }));
    setModal(null);
  }

  function taskTitle(id: string | null | undefined) {
    if (!id) return null;
    return data.tasks.find((t) => t.id === id)?.title || 'Unknown task';
  }

  const dependencyOptions = data.tasks.filter((t) => t.id !== form.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Project Tasks</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Renovation checklist · assign owners · set dependencies
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setForm(empty());
              setModal('new');
            }}
          >
            + Add task
          </button>
        )}
      </div>

      <div className="panel p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            className="input"
            placeholder="Search tasks…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">All priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="done">Complete</option>
          </select>
          <select
            className="input"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden panel">
        {tasks.length === 0 ? (
          <div className="empty-state">No tasks match your filters</div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className={`data-row grid grid-cols-1 items-start gap-3 md:grid-cols-[auto_1fr_auto] ${
                t.done ? 'opacity-60' : ''
              }`}
            >
              <label className="flex items-center pt-0.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-400"
                  checked={t.done}
                  disabled={!canEdit}
                  onChange={() =>
                    setData((d) => ({
                      ...d,
                      tasks: upsertTaskWithCascade(
                        d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                        { ...t, done: !t.done }
                      )
                    }))
                  }
                />
              </label>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${t.done ? 'line-through' : ''}`}>{t.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`badge badge-${t.priority.toLowerCase()}`}>{t.priority}</span>
                  {t.category && <span className="text-[11px] text-ink-dim">{t.category}</span>}
                  <span className="text-[11px] text-ink-dim">Due {formatDate(t.due)}</span>
                  {dueBadge(t.due, t.done)}
                  <span className="badge badge-role">
                    {t.assigneeName || (t.assigneeId ? nameFor(t.assigneeId) : 'Unassigned')}
                  </span>
                  {t.dependsOnId && (
                    <span className="text-[11px] text-ink-dim">
                      After: {taskTitle(t.dependsOnId)}
                    </span>
                  )}
                </div>
                {t.notes && <p className="mt-1.5 line-clamp-2 text-xs text-ink-dim">{t.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setForm({ ...empty(), ...t });
                      setModal('edit');
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      if (confirm('Delete this task?')) {
                        setData((d) => ({
                          ...d,
                          tasks: d.tasks
                            .filter((x) => x.id !== t.id)
                            .map((x) =>
                              x.dependsOnId === t.id ? { ...x, dependsOnId: null } : x
                            )
                        }));
                      }
                    }}
                  >
                    Del
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal open={!!modal} title={modal === 'new' ? 'Add Task' : 'Edit Task'} onClose={() => setModal(null)}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              >
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input
                type="date"
                className="input"
                required
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input
                type="date"
                className="input"
                value={form.startDate || form.due}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Duration (days)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={form.durationDays || 7}
                onChange={(e) =>
                  setForm({ ...form, durationDays: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
          </div>
          <div>
            <label className="label">Assign to</label>
            <select
              className="input"
              value={form.assigneeId || ''}
              onChange={(e) => {
                const id = e.target.value || null;
                const u = users.find((x) => x.id === id);
                setForm({
                  ...form,
                  assigneeId: id,
                  assigneeName: u?.displayName || null
                });
              }}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Depends on (starts after this finishes)</label>
            <select
              className="input"
              value={form.dependsOnId || ''}
              onChange={(e) =>
                setForm({ ...form, dependsOnId: e.target.value || null })
              }
            >
              <option value="">None</option>
              {dependencyOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} (due {formatDate(t.due)})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-dim">
              Timelines cascade automatically so this task starts the day after the dependency ends.
            </p>
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-amber-400"
              checked={form.done}
              onChange={(e) => setForm({ ...form, done: e.target.checked })}
            />
            Mark complete
          </label>
          <button type="submit" className="btn-primary w-full">
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}
