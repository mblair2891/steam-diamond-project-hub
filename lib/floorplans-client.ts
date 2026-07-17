/** Client helpers for cloud-synced multi-user Floor Plan versions. */

import type { FloorPlanComment, FloorPlanLayout } from '@/lib/types';

export const FLOORPLANS_CHANGED = 'sdh-floorplans-changed';

export function notifyFloorPlansChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FLOORPLANS_CHANGED));
}

export async function fetchFloorPlans(): Promise<{
  layouts: FloorPlanLayout[];
  total: number;
  updatedAt?: string;
  error?: string;
}> {
  const res = await fetch('/api/floorplans', {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const data = (await res.json().catch(() => ({}))) as {
    layouts?: FloorPlanLayout[];
    total?: number;
    updatedAt?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      layouts: [],
      total: 0,
      error: data.error || `Failed to load floor plans (${res.status})`
    };
  }
  return {
    layouts: Array.isArray(data.layouts) ? data.layouts : [],
    total: data.total ?? data.layouts?.length ?? 0,
    updatedAt: data.updatedAt
  };
}

export async function createFloorPlan(
  payload: Partial<FloorPlanLayout> & { name: string }
): Promise<FloorPlanLayout> {
  const res = await fetch('/api/floorplans', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as {
    layout?: FloorPlanLayout;
    error?: string;
  };
  if (!res.ok || !data.layout) {
    throw new Error(data.error || `Failed to create layout (${res.status})`);
  }
  notifyFloorPlansChanged();
  return data.layout;
}

export async function updateFloorPlan(
  id: string,
  patch: Partial<FloorPlanLayout>
): Promise<FloorPlanLayout> {
  const res = await fetch(`/api/floorplans/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const data = (await res.json().catch(() => ({}))) as {
    layout?: FloorPlanLayout;
    error?: string;
  };
  if (!res.ok || !data.layout) {
    throw new Error(data.error || `Failed to save layout (${res.status})`);
  }
  notifyFloorPlansChanged();
  return data.layout;
}

export async function deleteFloorPlan(id: string): Promise<void> {
  const res = await fetch(`/api/floorplans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to delete layout (${res.status})`);
  }
  notifyFloorPlansChanged();
}

export async function copyFloorPlan(
  id: string,
  opts?: { name?: string }
): Promise<FloorPlanLayout> {
  const res = await fetch(`/api/floorplans/${encodeURIComponent(id)}/copy`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {})
  });
  const data = (await res.json().catch(() => ({}))) as {
    layout?: FloorPlanLayout;
    error?: string;
  };
  if (!res.ok || !data.layout) {
    throw new Error(data.error || `Failed to copy layout (${res.status})`);
  }
  notifyFloorPlansChanged();
  return data.layout;
}

export async function postFloorPlanComment(
  id: string,
  comment: { body: string; parentId?: string | null; authorName?: string }
): Promise<{ layout: FloorPlanLayout; comment: FloorPlanComment }> {
  const res = await fetch(`/api/floorplans/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment)
  });
  const data = (await res.json().catch(() => ({}))) as {
    layout?: FloorPlanLayout;
    comment?: FloorPlanComment;
    error?: string;
  };
  if (!res.ok || !data.layout || !data.comment) {
    throw new Error(data.error || `Failed to post comment (${res.status})`);
  }
  notifyFloorPlansChanged();
  return { layout: data.layout, comment: data.comment };
}
