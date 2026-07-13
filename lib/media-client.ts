/** Client helpers for the cloud-synced Media Library. */

export const MEDIA_LIBRARY_CHANGED = 'sdh-media-library-changed';

export function notifyMediaLibraryChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MEDIA_LIBRARY_CHANGED));
}

export type CloudMediaAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  fileUrl?: string;
  pathname?: string;
  notes: string;
  title?: string;
  description?: string;
  scheduledDate?: string;
  status?: string;
  addedAt: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
};

export async function fetchMediaLibrary(): Promise<{
  assets: CloudMediaAsset[];
  total: number;
  fetchedAt?: string;
  error?: string;
}> {
  const res = await fetch('/api/media/list', {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const data = (await res.json().catch(() => ({}))) as {
    assets?: CloudMediaAsset[];
    total?: number;
    fetchedAt?: string;
    error?: string;
  };

  if (!res.ok) {
    return {
      assets: [],
      total: 0,
      error: data.error || `Failed to load library (${res.status})`
    };
  }

  return {
    assets: Array.isArray(data.assets) ? data.assets : [],
    total: data.total ?? data.assets?.length ?? 0,
    fetchedAt: data.fetchedAt
  };
}

export async function saveMediaMeta(payload: {
  pathname?: string;
  url?: string;
  title?: string;
  description?: string;
  notes?: string;
  scheduledDate?: string;
  status?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  name?: string;
  mime?: string;
}): Promise<void> {
  const res = await fetch('/api/media/meta', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to save metadata (${res.status})`);
  }
  notifyMediaLibraryChanged();
}
