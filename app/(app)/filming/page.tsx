'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { formatDate, uid } from '@/lib/dates';
import type { FilmDay, ShotStatus } from '@/lib/types';

export default function FilmingPage() {
  const { data, setData, getKeysDate } = useProject();
  const { canEdit } = useRole();
  const [dayModal, setDayModal] = useState(false);
  const [shotModal, setShotModal] = useState(false);
  const [dayForm, setDayForm] = useState<FilmDay>({
    id: '',
    date: getKeysDate(),
    title: '',
    location: '',
    notes: ''
  });
  const [shotForm, setShotForm] = useState({
    shot: '',
    dayId: data.filming.days[0]?.id || '',
    status: 'planned' as ShotStatus
  });

  const days = [...data.filming.days].sort((a, b) => a.date.localeCompare(b.date));
  const shots = data.filming.shots;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Filming & Production</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">Shoot days and shot list</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setDayForm({ id: '', date: getKeysDate(), title: '', location: '', notes: '' });
                setDayModal(true);
              }}
            >
              + Shoot day
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                if (!data.filming.days.length) {
                  alert('Add a shoot day first');
                  return;
                }
                setShotForm({
                  shot: '',
                  dayId: data.filming.days[0].id,
                  status: 'planned'
                });
                setShotModal(true);
              }}
            >
              + Shot
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden panel">
          <div className="border-b border-surface-600 px-4 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide">Shoot Days</h3>
          </div>
          {days.map((d) => (
            <div key={d.id} className="data-row">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-amber-300">{formatDate(d.date)}</div>
                  <div className="mt-0.5 text-sm font-medium">{d.title}</div>
                  <div className="mt-1 text-xs text-ink-dim">{d.location}</div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setDayForm({ ...d });
                        setDayModal(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        if (!confirm('Delete shoot day?')) return;
                        setData((prev) => ({
                          ...prev,
                          filming: {
                            days: prev.filming.days.filter((x) => x.id !== d.id),
                            shots: prev.filming.shots.filter((s) => s.dayId !== d.id)
                          }
                        }));
                      }}
                    >
                      Del
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden panel">
          <div className="border-b border-surface-600 px-4 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide">Shot List</h3>
          </div>
          {shots.map((s) => {
            const day = days.find((d) => d.id === s.dayId);
            return (
              <div key={s.id} className="data-row grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-sm">{s.shot}</div>
                  <div className="mt-1 text-[11px] text-ink-dim">
                    {day ? `${day.title} · ${formatDate(day.date)}` : 'Unassigned'} ·{' '}
                    <span className="capitalize">{s.status}</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <select
                      className="input !w-auto py-1 text-xs"
                      value={s.status}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          filming: {
                            ...d.filming,
                            shots: d.filming.shots.map((x) =>
                              x.id === s.id ? { ...x, status: e.target.value as ShotStatus } : x
                            )
                          }
                        }))
                      }
                    >
                      <option value="planned">planned</option>
                      <option value="filmed">filmed</option>
                      <option value="cut">cut</option>
                      <option value="killed">killed</option>
                    </select>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        if (!confirm('Delete shot?')) return;
                        setData((d) => ({
                          ...d,
                          filming: {
                            ...d.filming,
                            shots: d.filming.shots.filter((x) => x.id !== s.id)
                          }
                        }));
                      }}
                    >
                      Del
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={dayModal}
        title={dayForm.id ? 'Edit Shoot Day' : 'Add Shoot Day'}
        onClose={() => setDayModal(false)}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const next = { ...dayForm, id: dayForm.id || uid('fd'), title: dayForm.title.trim() };
            setData((d) => {
              const idx = d.filming.days.findIndex((x) => x.id === next.id);
              const list = [...d.filming.days];
              if (idx >= 0) list[idx] = next;
              else list.push(next);
              return { ...d, filming: { ...d.filming, days: list } };
            });
            setDayModal(false);
          }}
        >
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={dayForm.title}
              onChange={(e) => setDayForm({ ...dayForm, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              required
              value={dayForm.date}
              onChange={(e) => setDayForm({ ...dayForm, date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={dayForm.location}
              onChange={(e) => setDayForm({ ...dayForm, location: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[5rem]"
              value={dayForm.notes}
              onChange={(e) => setDayForm({ ...dayForm, notes: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Save
          </button>
        </form>
      </Modal>

      <Modal open={shotModal} title="Add Shot" onClose={() => setShotModal(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!shotForm.dayId) return;
            setData((d) => ({
              ...d,
              filming: {
                ...d.filming,
                shots: [
                  ...d.filming.shots,
                  {
                    id: uid('sh'),
                    shot: shotForm.shot.trim(),
                    dayId: shotForm.dayId,
                    status: shotForm.status
                  }
                ]
              }
            }));
            setShotModal(false);
          }}
        >
          <div>
            <label className="label">Shot description</label>
            <input
              className="input"
              required
              value={shotForm.shot}
              onChange={(e) => setShotForm({ ...shotForm, shot: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Shoot day</label>
            <select
              className="input"
              value={shotForm.dayId}
              onChange={(e) => setShotForm({ ...shotForm, dayId: e.target.value })}
            >
              {data.filming.days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({formatDate(d.date)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={shotForm.status}
              onChange={(e) => setShotForm({ ...shotForm, status: e.target.value as ShotStatus })}
            >
              <option value="planned">planned</option>
              <option value="filmed">filmed</option>
              <option value="cut">cut</option>
              <option value="killed">killed</option>
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">
            Add shot
          </button>
        </form>
      </Modal>
    </div>
  );
}
