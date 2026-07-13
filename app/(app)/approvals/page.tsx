'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useRole } from '@/hooks/useRole';
import { formatDate, toISODate, uid } from '@/lib/dates';
import { notifyUsers } from '@/lib/notify-client';
import type { Approval, ApprovalStatus } from '@/lib/types';

function emptyApproval(): Approval {
  return {
    id: '',
    title: '',
    owner: 'Owners',
    status: 'pending',
    notes: '',
    updatedAt: '',
    assigneeId: null,
    assigneeName: null
  };
}

export default function ApprovalsPage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const { users } = useAssignableUsers();
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<Approval>(emptyApproval());

  function badgeClass(status: string) {
    if (status === 'approved') return 'badge-approved';
    if (status === 'rejected') return 'badge-rejected';
    if (status === 'review') return 'badge-review';
    return 'badge-pending';
  }

  async function maybeNotify(
    next: Approval,
    prev: Approval | undefined,
    forceReview = false
  ) {
    const needsReview =
      next.status === 'pending' || next.status === 'review' || forceReview;
    if (!needsReview || !next.assigneeId) return;

    const assigneeChanged = next.assigneeId !== prev?.assigneeId;
    const enteredReview =
      next.status === 'review' && prev?.status !== 'review'
        ? true
        : next.status === 'pending' && prev?.status !== 'pending' && !prev;

    if (!assigneeChanged && !enteredReview && !forceReview) {
      // Still notify on status flip into review
      if (!(next.status === 'review' && prev?.status !== 'review')) return;
    }

    await notifyUsers({
      userIds: [next.assigneeId],
      type: 'approval',
      title: next.title,
      message: `Approval "${next.title}" is ${next.status} and needs your attention.`
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const prev = data.approvals.find((x) => x.id === form.id);
    const assignee = users.find((u) => u.id === form.assigneeId);
    const next: Approval = {
      ...form,
      id: form.id || uid('a'),
      title: form.title.trim(),
      updatedAt: toISODate(new Date()),
      assigneeId: form.assigneeId || null,
      assigneeName: form.assigneeId
        ? assignee?.displayName || form.assigneeName || null
        : null
    };
    setData((d) => {
      const idx = d.approvals.findIndex((x) => x.id === next.id);
      const approvals = [...d.approvals];
      if (idx >= 0) approvals[idx] = next;
      else approvals.push(next);
      return { ...d, approvals };
    });

    const isNew = !prev;
    await maybeNotify(next, prev, isNew && (next.status === 'pending' || next.status === 'review'));
    setModal(null);
  }

  async function updateStatus(id: string, status: ApprovalStatus) {
    const prev = data.approvals.find((x) => x.id === id);
    if (!prev) return;
    const next: Approval = {
      ...prev,
      status,
      updatedAt: toISODate(new Date())
    };
    setData((d) => ({
      ...d,
      approvals: d.approvals.map((x) => (x.id === id ? next : x))
    }));
    if (status === 'pending' || status === 'review') {
      await maybeNotify(next, prev);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Approvals & Decisions</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Owner decisions and sign-offs · SMS on review assignment
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              setForm(emptyApproval());
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
                {a.assigneeName && (
                  <span className="badge badge-role">{a.assigneeName}</span>
                )}
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
                  onChange={(e) => void updateStatus(a.id, e.target.value as ApprovalStatus)}
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
                    setForm({ ...emptyApproval(), ...a });
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
        <form onSubmit={(e) => void save(e)} className="space-y-3">
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
              <label className="label">Owner (label)</label>
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
            <label className="label">Assign reviewer (SMS)</label>
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
                  {u.phone ? '' : ' (no phone)'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-dim">
              Pending / review items notify the assignee when Twilio is configured.
            </p>
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
