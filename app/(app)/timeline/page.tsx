'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { formatDate, toISODate, uid } from '@/lib/dates';

export default function TimelinePage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: toISODate(new Date()), title: '', body: '' });

  const items = [
    ...data.keyDates.map((k) => ({
      date: k.date,
      title: k.label,
      body: 'Key project date',
      kind: 'key' as const,
      id: k.id
    })),
    ...data.timelineNotes.map((t) => ({
      date: t.date,
      title: t.title,
      body: t.body,
      kind: 'note' as const,
      id: t.id
    })),
    ...data.filming.days.map((f) => ({
      date: f.date,
      title: `Filming: ${f.title}`,
      body: f.location,
      kind: 'film' as const,
      id: f.id
    }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Project Timeline</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">Key dates, notes, and production milestones</p>
        </div>
        {canEdit && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            + Timeline note
          </button>
        )}
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="timeline-line">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="relative pb-6 last:pb-0">
              <span
                className="timeline-dot"
                style={item.kind === 'film' ? { background: '#6cb6ff' } : undefined}
              />
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
                {formatDate(item.date)}
              </div>
              <div className="mt-0.5 text-sm font-semibold">{item.title}</div>
              <div className="mt-1 text-xs text-ink-muted">{item.body}</div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={open} title="Add Timeline Note" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setData((d) => ({
              ...d,
              timelineNotes: [
                ...d.timelineNotes,
                { id: uid('tn'), date: form.date, title: form.title.trim(), body: form.body }
              ]
            }));
            setOpen(false);
            setForm({ date: toISODate(new Date()), title: '', body: '' });
          }}
        >
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Add
          </button>
        </form>
      </Modal>
    </div>
  );
}
