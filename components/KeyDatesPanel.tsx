'use client';

import { useState } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { formatDate, toISODate, uid } from '@/lib/dates';
import type { KeyDate } from '@/lib/types';
import Modal from './Modal';

export default function KeyDatesPanel({ editable }: { editable: boolean }) {
  const { data, setData } = useProject();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<KeyDate[]>([]);

  function openEditor() {
    setDraft(data.keyDates.map((k) => ({ ...k })));
    setOpen(true);
  }

  function save() {
    const next = draft
      .map((k) => ({
        id: k.id || uid('kd'),
        label: (k.label || 'Untitled').trim(),
        date: k.date
      }))
      .filter((k) => k.date);

    if (!next.length) return;
    if (!next.some((k) => k.id === 'kd_keys')) next[0].id = 'kd_keys';

    setData((d) => ({ ...d, keyDates: next }));
    setOpen(false);
  }

  const sorted = [...data.keyDates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">Key Dates</h3>
          {editable && (
            <button type="button" className="btn-ghost btn-sm" onClick={openEditor}>
              Edit
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {sorted.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 panel-inset px-3 py-2.5">
              <span className="text-sm">{k.label}</span>
              <span className="whitespace-nowrap text-sm font-semibold text-amber-300">
                {formatDate(k.date)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Modal open={open} title="Key Dates" onClose={() => setOpen(false)} wide>
        <p className="mb-4 text-sm text-ink-muted">
          Gantt phases offset from the <strong className="text-amber-300">Keys Received</strong> date.
        </p>
        <div className="space-y-3">
          {draft.map((k, i) => (
            <div
              key={k.id || i}
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_150px_auto]"
            >
              <div>
                <label className="label">Label</label>
                <input
                  className="input"
                  value={k.label}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...next[i], label: e.target.value };
                    setDraft(next);
                  }}
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={k.date}
                  onChange={(e) => {
                    const next = [...draft];
                    next[i] = { ...next[i], date: e.target.value };
                    setDraft(next);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-danger mb-0.5"
                disabled={draft.length <= 1}
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setDraft([
                ...draft,
                { id: uid('kd'), label: 'New Milestone', date: toISODate(new Date()) }
              ])
            }
          >
            + Add date
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            Save dates
          </button>
        </div>
      </Modal>
    </>
  );
}
