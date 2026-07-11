'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRole } from '@/hooks/useRole';
import type { AppRole } from '@/lib/roles';
import { APP_ROLES, roleLabel } from '@/lib/roles';

type ListedUser = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  role: AppRole;
  roleLabel: string;
  createdAt: number;
};

export default function UsersPage() {
  const { canManageUsers, isLoaded, user } = useRole();
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    phoneNumber: '',
    email: '',
    firstName: '',
    lastName: '',
    role: 'editor' as AppRole
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && canManageUsers) loadUsers();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, canManageUsers, loadUsers]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      setSuccess(data.message || 'User created');
      setForm({
        phoneNumber: '',
        email: '',
        firstName: '',
        lastName: '',
        role: 'editor'
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(userId: string, role: AppRole) {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setSuccess('Role updated');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  if (!isLoaded) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!canManageUsers) {
    return (
      <div className="panel p-6">
        <h2 className="section-title">Users</h2>
        <p className="mt-4 text-sm text-ink-muted">
          Only <strong className="text-ink">admin</strong> users can create or manage accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">User management</h2>
        <p className="ml-3 mt-1 text-sm text-ink-muted">
          Admin only — invite users and assign roles (admin, editor, view-only).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="panel p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide">Create / invite user</h3>
        <form onSubmit={invite} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Phone (E.164)</label>
            <input
              className="input"
              placeholder="+15551234567"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-ink-dim">
              Preferred for phone login. Creates a Clerk user who can sign in with SMS OTP.
            </p>
          </div>
          <div>
            <label className="label">Email (optional invite)</label>
            <input
              type="email"
              className="input"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">First name</label>
            <input
              className="input"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Last name</label>
            <input
              className="input"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Role</label>
            <select
              className="input max-w-xs"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
            >
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)} ({r})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden panel">
        <div className="flex items-center justify-between border-b border-surface-600 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide">Users</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={loadUsers} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="empty-state">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="empty-state">No users found</div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="data-row grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="text-sm font-medium">{u.displayName}</div>
                <div className="mt-1 text-[11px] text-ink-dim">
                  {u.phone || '—'}
                  {u.email ? ` · ${u.email}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-role">{u.roleLabel}</span>
                {u.id !== user?.id ? (
                  <select
                    className="input !w-auto py-1 text-xs"
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as AppRole)}
                  >
                    {APP_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-amber-300">You</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
