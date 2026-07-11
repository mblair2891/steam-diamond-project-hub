'use client';

import { useMemo, useState } from 'react';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { formatDate, uid } from '@/lib/dates';

function formatBytes(n: number) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export default function MediaPage() {
  const { data, setData } = useProject();
  const { canEdit } = useRole();
  const [filter, setFilter] = useState('');
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  const assets = useMemo(() => {
    let list = [...data.mediaAssets].reverse();
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data.mediaAssets, filter]);

  function handleFiles(fileList: FileList | null) {
    if (!canEdit || !fileList) return;
    setError('');
    const files = Array.from(fileList);
    const max = 2.5 * 1024 * 1024;

    files.forEach((file) => {
      if (file.size > max) {
        setError(`${file.name} too large (max ~2.5MB for local storage)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setData((d) => ({
          ...d,
          mediaAssets: [
            ...d.mediaAssets,
            {
              id: uid('ma'),
              name: file.name,
              mime: file.type,
              size: file.size,
              dataUrl: String(reader.result || ''),
              notes: '',
              addedAt: new Date().toISOString()
            }
          ]
        }));
      };
      reader.onerror = () => setError(`Failed to read ${file.name}`);
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">Media Library</h2>
        <p className="ml-3 mt-1 text-sm text-ink-muted">
          Drag & drop uploads with previews (stored locally in this browser)
        </p>
      </div>

      {canEdit && (
        <div
          className={`dropzone ${drag ? 'dropzone-active' : ''}`}
          onClick={() => document.getElementById('file-input')?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="mb-2 text-3xl opacity-60">⇪</div>
          <p className="text-sm font-semibold text-amber-300">Drag & drop files here</p>
          <p className="mt-1 text-xs text-ink-dim">or click to browse</p>
          <input
            id="file-input"
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="panel p-3">
        <input
          type="search"
          className="input"
          placeholder="Filter assets…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="overflow-hidden panel">
        {assets.length === 0 ? (
          <div className="empty-state">No media assets yet</div>
        ) : (
          assets.map((a) => {
            const isImg = (a.mime || '').startsWith('image/');
            return (
              <div key={a.id} className="data-row grid grid-cols-[auto_1fr_auto] items-center gap-3">
                {isImg && a.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.dataUrl}
                    alt=""
                    className="h-14 w-14 rounded-lg border border-surface-600 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg">
                    {(a.mime || '').startsWith('video/') ? '▶' : '📄'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="mt-0.5 text-[11px] text-ink-dim">
                    {a.mime || 'file'} · {formatBytes(a.size)} ·{' '}
                    {formatDate(a.addedAt?.slice(0, 10) || '')}
                  </div>
                </div>
                <div className="flex gap-1">
                  {a.dataUrl && (
                    <a className="btn-ghost btn-sm" href={a.dataUrl} download={a.name}>
                      ↓
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        if (confirm('Remove this asset?')) {
                          setData((d) => ({
                            ...d,
                            mediaAssets: d.mediaAssets.filter((x) => x.id !== a.id)
                          }));
                        }
                      }}
                    >
                      Del
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
