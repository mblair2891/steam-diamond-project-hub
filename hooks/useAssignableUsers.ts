'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AssignableUser } from '@/lib/types';

export function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users/assignable');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function nameFor(id: string | null | undefined): string {
    if (!id) return 'Unassigned';
    return users.find((u) => u.id === id)?.displayName || 'Unknown user';
  }

  return { users, loading, error, reload, nameFor };
}
