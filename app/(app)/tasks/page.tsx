'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { formatDate, toISODate, uid } from '@/lib/dates';
import type { Priority, Task } from '@/lib/types';

const empty = (): Task => ({
  id: '',
  title: '',
  priority: 'Medium',
  due: toISODate(new Date()),
  done: false,
  notes: '',
  category: 'General'
});

export default function TasksPage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
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
          (t.category || '').toLowerCase().includes(qq)
      );
    }
    if (priority !== 'all') list = list.filter((t) => t.priority === priority);
    if (status === 'open') list = list.filter((t) => !t.done);
    if (status === 'done') list = list.filter((t) => t.done);
    return list.sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));
  }, [data.tasks, q, priority, status]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next: Task = { ...form, id: form.id || uid('t'), title: form.title.trim() };
    setData((d) => {
      const idx = d.tasks.findIndex((x) => x.id === next.id);
      const tasks = [...d.tasks];
      if (idx >= 0) tasks[idx] = next;
      else tasks.push(next);
      return { ...d, tasks };
    });
    setModal(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Project Tasks</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">Renovation & buildout checklist</p>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                      tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))
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
                </div>
                {t.notes && <p className="mt-1.5 line-clamp-2 text-xs text-ink-dim">{t.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setForm({ ...t });
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
                        setData((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== t.id) }));
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
