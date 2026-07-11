'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { formatDate, toISODate, uid } from '@/lib/dates';
import type { Approval, ApprovalStatus } from '@/lib/types';

export default function ApprovalsPage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<Approval>({
    id: '',
    title: '',
    owner: 'Owners',
    status: 'pending',
    notes: '',
    updatedAt: ''
  });

  function badgeClass(status: string) {
    if (status === 'approved') return 'badge-approved';
    if (status === 'rejected') return 'badge-rejected';
    if (status === 'review') return 'badge-review';
    return 'badge-pending';
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next: Approval = {
      ...form,
      id: form.id || uid('a'),
      title: form.title.trim(),
      updatedAt: toISODate(new Date())
    };
    setData((d) => {
      const idx = d.approvals.findIndex((x) => x.id === next.id);
      const approvals = [...d.approvals];
      if (idx >= 0) approvals[idx] = next;
      else approvals.push(next);
      return { ...d, approvals };
    });
    setModal(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Approvals & Decisions</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">Owner decisions and sign-offs</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setForm({
                id: '',
                title: '',
                owner: 'Owners',
                status: 'pending',
                notes: '',
                updatedAt: ''
              });
              setModal('new');
            }}
          >
            + Item
          </button>
        )}
      </div>

      <div className="overflow-hidden panel">
        {data.approvals.map((a) => (
          <div key={a.id} className="data-row grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <div className="text-sm font-medium">{a.title}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`badge ${badgeClass(a.status)}`}>{a.status}</span>
                <span className="text-[11px] text-ink-dim">Owner: {a.owner || '—'}</span>
                {a.updatedAt && (
                  <span className="text-[11px] text-ink-dim">Updated {formatDate(a.updatedAt)}</span>
                )}
              </div>
              {a.notes && <p className="mt-1.5 text-xs text-ink-dim">{a.notes}</p>}
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-start gap-1">
                <select
                  className="input !w-auto py-1 text-xs"
                  value={a.status}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      approvals: d.approvals.map((x) =>
                        x.id === a.id
                          ? {
                              ...x,
                              status: e.target.value as ApprovalStatus,
                              updatedAt: toISODate(new Date())
                            }
                          : x
                      )
                    }))
                  }
                >
                  <option value="pending">pending</option>
                  <option value="review">review</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setForm({ ...a });
                    setModal('edit');
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    if (confirm('Delete?')) {
                      setData((d) => ({
                        ...d,
                        approvals: d.approvals.filter((x) => x.id !== a.id)
                      }));
                    }
                  }}
                >
                  Del
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        open={!!modal}
        title={modal === 'new' ? 'Add Approval Item' : 'Edit Approval'}
        onClose={() => setModal(null)}
      >
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
              <label className="label">Owner</label>
              <input
                className="input"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ApprovalStatus })}
              >
                <option value="pending">pending</option>
                <option value="review">review</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}
