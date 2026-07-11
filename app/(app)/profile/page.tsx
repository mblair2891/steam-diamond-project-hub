'use client';

import { UserProfile } from '@clerk/nextjs';
import { useRole } from '@/hooks/useRole';

export default function ProfilePage() {
  const { displayName, phone, email, role, canEdit, user } = useRole();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="section-title">Profile & Settings</h2>
        <p className="ml-3 mt-1 text-sm text-ink-muted">
          Update your info and security settings. Roles are managed in Clerk.
        </p>
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-4">
          {user?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.imageUrl}
              alt=""
              className="h-14 w-14 rounded-full border-2 border-amber-400/40 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400/40 bg-surface-700 text-xl font-bold text-amber-300">
              {(displayName || '?').replace(/^\+/, '').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{displayName}</div>
            {phone && <div className="mt-0.5 font-mono text-sm text-ink-muted">{phone}</div>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="badge badge-role">{role}</span>
              <span className="text-[11px] text-ink-dim">
                {canEdit ? 'Can edit project data' : 'Read-only access'}
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="panel-inset p-3">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">Display name</dt>
            <dd className="mt-0.5 text-sm">{displayName}</dd>
          </div>
          <div className="panel-inset p-3">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">Role</dt>
            <dd className="mt-0.5 text-sm capitalize">{role}</dd>
          </div>
          <div className="panel-inset p-3 sm:col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">Phone</dt>
            <dd className="mt-0.5 font-mono text-sm">{phone || '—'}</dd>
          </div>
          {email ? (
            <div className="panel-inset p-3 sm:col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-dim">Email</dt>
              <dd className="mt-0.5 text-sm">{email}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-ink-dim">
          Set roles in Clerk Dashboard → Users → Metadata (Public):{' '}
          <code className="text-amber-300">{`{ "role": "editor" }`}</code> or{' '}
          <code className="text-amber-300">viewer</code> / <code className="text-amber-300">admin</code>.
          Use the panel below to update profile details and security (password if enabled in Clerk).
        </p>
      </div>

      <div className="overflow-hidden panel p-2 sm:p-4">
        <h3 className="mb-3 px-2 text-sm font-bold uppercase tracking-wide text-ink-muted sm:px-0">
          Clerk account settings
        </h3>
        <div className="flex justify-center overflow-x-auto">
          <UserProfile
            appearance={{
              elements: {
                rootBox: 'w-full max-w-full',
                card: 'w-full max-w-full border-surface-600 bg-surface-800 shadow-none'
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
