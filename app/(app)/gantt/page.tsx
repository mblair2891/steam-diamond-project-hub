'use client';

import KeyDatesPanel from '@/components/KeyDatesPanel';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { addDays, clamp, daysBetween, formatDate, uid } from '@/lib/dates';

export default function GanttPage() {
  const { data, setData, getKeysDate, getOpenDate } = useProject();
  const { canEdit } = useRole();
  const keys = getKeysDate();
  const open = getOpenDate();

  const phases = data.phases.map((p) => ({
    ...p,
    start: addDays(keys, p.startOffset),
    end: addDays(keys, p.endOffset)
  }));

  const allDates = [
    ...phases.flatMap((p) => [p.start, p.end]),
    keys,
    open,
    ...data.keyDates.map((k) => k.date)
  ];
  const minD = allDates.reduce((a, b) => (a < b ? a : b));
  const maxD = allDates.reduce((a, b) => (a > b ? a : b));
  const rangeStart = addDays(minD, -7);
  const rangeEnd = addDays(maxD, 7);
  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 1);
  const pct = (iso: string) => clamp((daysBetween(rangeStart, iso) / totalDays) * 100, 0, 100);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">Gantt Timeline</h2>
        <p className="ml-3 mt-1 text-sm text-ink-muted">
          Anchored to Keys Received ({formatDate(keys)}) · Opening {formatDate(open)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 sm:p-5 lg:col-span-2">
          <div className="scrollbar-thin overflow-x-auto pb-2">
            <div className="min-w-[640px]">
              <div className="mb-6 flex justify-between px-1 text-[10px] text-ink-dim">
                <span>{formatDate(rangeStart)}</span>
                <span>{formatDate(rangeEnd)}</span>
              </div>
              {phases.map((p) => {
                const left = pct(p.start);
                const right = pct(p.end);
                const width = p.type === 'milestone' ? 0 : Math.max(right - left, 0.8);
                return (
                  <div
                    key={p.id}
                    className="mb-3 grid grid-cols-[140px_1fr] items-center gap-2 sm:grid-cols-[160px_1fr]"
                  >
                    <div className="truncate text-xs font-medium sm:text-sm">{p.name}</div>
                    <div className="gantt-track">
                      {data.keyDates.map((k) => (
                        <div key={k.id} className="gantt-marker" style={{ left: `${pct(k.date)}%` }}>
                          <span>{k.label.split(' ')[0]}</span>
                        </div>
                      ))}
                      <div
                        className={`gantt-bar ${p.type === 'milestone' ? 'milestone' : ''}`}
                        style={{
                          left: `${left}%`,
                          width: p.type === 'milestone' ? '10px' : `${width}%`
                        }}
                      >
                        {p.type === 'milestone' ? '' : p.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <KeyDatesPanel editable={canEdit} />
      </div>

      {canEdit && (
        <div className="panel p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-bold">Phases (offsets from Keys day)</h3>
          <div className="space-y-2">
            {data.phases.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 items-end gap-2 panel-inset p-2 sm:grid-cols-[1fr_80px_80px_120px_auto]"
              >
                <div>
                  <label className="label">Name</label>
                  <input
                    className="input"
                    value={p.name}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        phases: d.phases.map((x) =>
                          x.id === p.id ? { ...x, name: e.target.value } : x
                        )
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">Start +d</label>
                  <input
                    type="number"
                    className="input"
                    value={p.startOffset}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        phases: d.phases.map((x) =>
                          x.id === p.id ? { ...x, startOffset: Number(e.target.value) || 0 } : x
                        )
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">End +d</label>
                  <input
                    type="number"
                    className="input"
                    value={p.endOffset}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        phases: d.phases.map((x) =>
                          x.id === p.id ? { ...x, endOffset: Number(e.target.value) || 0 } : x
                        )
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select
                    className="input"
                    value={p.type}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        phases: d.phases.map((x) =>
                          x.id === p.id
                            ? { ...x, type: e.target.value as 'phase' | 'milestone' }
                            : x
                        )
                      }))
                    }
                  >
                    <option value="phase">Phase</option>
                    <option value="milestone">Milestone</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() =>
                    setData((d) => ({ ...d, phases: d.phases.filter((x) => x.id !== p.id) }))
                  }
                >
                  Del
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm mt-3"
            onClick={() =>
              setData((d) => ({
                ...d,
                phases: [
                  ...d.phases,
                  { id: uid('ph'), name: 'New Phase', startOffset: 0, endOffset: 7, type: 'phase' }
                ]
              }))
            }
          >
            + Phase
          </button>
        </div>
      )}
    </div>
  );
}
