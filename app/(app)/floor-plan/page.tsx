'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import { useRole } from '@/hooks/useRole';
import { uploadToBlob } from '@/lib/blob-upload';
import {
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  DEFAULT_FLOOR_PLAN_BG,
  DEFAULT_GRID_SIZE,
  FLOOR_PLAN_CATALOG,
  FLOOR_PLAN_CATEGORIES,
  getCatalogItem,
  type FloorPlanCategory
} from '@/lib/floorplan-catalog';
import { uid } from '@/lib/dates';
import type { FloorPlanLayout, FloorPlanPlacedItem } from '@/lib/types';
import type { FloorPlanStageHandle } from '@/components/floorplan/types';

/** Double-guard: never load Konva on the server (ssr: false + canvas webpack alias). */
const FloorPlanCanvas = dynamic(
  () => import('@/components/floorplan/FloorPlanCanvasLazy'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-ink-dim">
        Loading canvas…
      </div>
    )
  }
);

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function emptyLayout(name: string): FloorPlanLayout {
  const now = new Date().toISOString();
  return {
    id: uid('fp'),
    name,
    description: '',
    backgroundUrl: DEFAULT_FLOOR_PLAN_BG,
    backgroundPathname: null,
    backgroundName: 'default-floor-plan.svg',
    canvasWidth: DEFAULT_CANVAS_W,
    canvasHeight: DEFAULT_CANVAS_H,
    gridSize: DEFAULT_GRID_SIZE,
    snapToGrid: true,
    items: [],
    comments: [],
    createdAt: now,
    updatedAt: now,
    updatedByName: null
  };
}

export default function FloorPlanPage() {
  const { data, setData, addFloorPlanComment } = useProject();
  const { canEdit, user, displayName } = useRole();
  const { success, error: toastError } = useToast();

  const layouts = data.floorPlans || [];
  /** Local selection so view-only users can switch layouts without setData */
  const [activeId, setActiveId] = useState<string | null>(
    () => data.activeFloorPlanId || layouts[0]?.id || null
  );

  useEffect(() => {
    if (!layouts.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !layouts.some((l) => l.id === activeId)) {
      setActiveId(data.activeFloorPlanId || layouts[0].id);
    }
  }, [layouts, activeId, data.activeFloorPlanId]);

  const layout = layouts.find((l) => l.id === activeId) || layouts[0] || null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<FloorPlanCategory | 'all'>('all');
  const [sideTab, setSideTab] = useState<'library' | 'layouts' | 'comments'>('library');
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [modal, setModal] = useState<'new-layout' | 'rename' | null>(null);
  const [layoutForm, setLayoutForm] = useState({ name: '', description: '' });
  const [uploadingBg, setUploadingBg] = useState(false);
  const [exporting, setExporting] = useState(false);

  const stageRef = useRef<FloorPlanStageHandle | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const catalogFiltered = useMemo(() => {
    if (category === 'all') return FLOOR_PLAN_CATALOG;
    return FLOOR_PLAN_CATALOG.filter((c) => c.category === category);
  }, [category]);

  const touchLayout = useCallback(
    (updater: (prev: FloorPlanLayout) => FloorPlanLayout) => {
      if (!layout || !canEdit) return;
      setData((d) => {
        const list = [...(d.floorPlans || [])];
        const idx = list.findIndex((l) => l.id === layout.id);
        if (idx < 0) return d;
        list[idx] = {
          ...updater(list[idx]),
          updatedAt: new Date().toISOString(),
          updatedByName: displayName || null
        };
        return { ...d, floorPlans: list, activeFloorPlanId: list[idx].id };
      });
    },
    [layout, canEdit, setData, displayName]
  );

  const setItems = useCallback(
    (items: FloorPlanPlacedItem[]) => {
      touchLayout((prev) => ({ ...prev, items }));
    },
    [touchLayout]
  );

  function selectLayout(id: string) {
    setActiveId(id);
    setSelectedId(null);
    if (canEdit) {
      setData((d) => ({ ...d, activeFloorPlanId: id }));
    }
  }

  function createLayout() {
    const name = layoutForm.name.trim() || 'New layout';
    const next = emptyLayout(name);
    next.description = layoutForm.description.trim();
    next.updatedByName = displayName || null;
    if (layout) {
      next.backgroundUrl = layout.backgroundUrl;
      next.backgroundPathname = layout.backgroundPathname;
      next.backgroundName = layout.backgroundName;
      next.canvasWidth = layout.canvasWidth;
      next.canvasHeight = layout.canvasHeight;
    }
    setData((d) => ({
      ...d,
      floorPlans: [...(d.floorPlans || []), next],
      activeFloorPlanId: next.id
    }));
    setActiveId(next.id);
    setModal(null);
    setLayoutForm({ name: '', description: '' });
    success('Layout created', name);
  }

  function renameLayout() {
    if (!layout) return;
    const name = layoutForm.name.trim();
    if (!name) return;
    touchLayout((prev) => ({
      ...prev,
      name,
      description: layoutForm.description.trim()
    }));
    setModal(null);
    success('Layout updated');
  }

  function duplicateLayout() {
    if (!layout || !canEdit) return;
    const copy: FloorPlanLayout = {
      ...layout,
      id: uid('fp'),
      name: `${layout.name} (copy)`,
      items: layout.items.map((i) => ({ ...i, id: uid('fpi') })),
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedByName: displayName || null
    };
    setData((d) => ({
      ...d,
      floorPlans: [...(d.floorPlans || []), copy],
      activeFloorPlanId: copy.id
    }));
    setActiveId(copy.id);
    success('Layout duplicated');
  }

  function deleteLayout() {
    if (!layout || !canEdit) return;
    if (layouts.length <= 1) {
      toastError('Cannot delete', 'Keep at least one layout.');
      return;
    }
    if (!confirm(`Delete layout “${layout.name}”?`)) return;
    setData((d) => {
      const floorPlans = (d.floorPlans || []).filter((l) => l.id !== layout.id);
      return {
        ...d,
        floorPlans,
        activeFloorPlanId: floorPlans[0]?.id || null
      };
    });
    setActiveId(layouts.find((l) => l.id !== layout.id)?.id || null);
    setSelectedId(null);
    success('Layout deleted');
  }

  function placeFromLibrary(typeId: string, x: number, y: number) {
    if (!layout || !canEdit) return;
    const cat = getCatalogItem(typeId);
    if (!cat) return;
    const maxZ = layout.items.reduce((m, i) => Math.max(m, i.zIndex), 0);
    const count = layout.items.filter((i) => i.typeId === typeId).length + 1;
    const item: FloorPlanPlacedItem = {
      id: uid('fpi'),
      typeId,
      label: `${cat.label}${count > 1 ? ` ${count}` : ''}`,
      x,
      y,
      width: cat.defaultW,
      height: cat.defaultH,
      rotation: 0,
      zIndex: maxZ + 1
    };
    setItems([...layout.items, item]);
    setSelectedId(item.id);
  }

  function addItemCentered(typeId: string) {
    if (!layout) return;
    const cat = getCatalogItem(typeId);
    if (!cat) return;
    const x = layout.canvasWidth / 2 - cat.defaultW / 2;
    const y = layout.canvasHeight / 2 - cat.defaultH / 2;
    placeFromLibrary(typeId, x, y);
  }

  function deleteSelected() {
    if (!layout || !selectedId || !canEdit) return;
    setItems(layout.items.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  }

  function bringToFront() {
    if (!layout || !selectedId || !canEdit) return;
    const maxZ = layout.items.reduce((m, i) => Math.max(m, i.zIndex), 0);
    setItems(
      layout.items.map((i) => (i.id === selectedId ? { ...i, zIndex: maxZ + 1 } : i))
    );
  }

  function sendToBack() {
    if (!layout || !selectedId || !canEdit) return;
    const minZ = layout.items.reduce((m, i) => Math.min(m, i.zIndex), 0);
    setItems(
      layout.items.map((i) => (i.id === selectedId ? { ...i, zIndex: minZ - 1 } : i))
    );
  }

  function rotateSelected(delta: number) {
    if (!layout || !selectedId || !canEdit) return;
    setItems(
      layout.items.map((i) =>
        i.id === selectedId ? { ...i, rotation: (i.rotation + delta) % 360 } : i
      )
    );
  }

  async function uploadBackground(file: File) {
    if (!canEdit || !layout) return;
    const isImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|gif|webp|svg)$/i.test(file.name);
    if (!isImage) {
      toastError(
        'Unsupported file',
        'Upload an image (PNG, JPG, WebP, SVG). For PDF plans, export a page as an image first.'
      );
      return;
    }
    setUploadingBg(true);
    try {
      const result = await uploadToBlob({ file, folder: 'floorplans' });
      touchLayout((prev) => ({
        ...prev,
        backgroundUrl: result.url,
        backgroundPathname: result.pathname,
        backgroundName: result.name || file.name
      }));
      success('Floor plan background updated');
    } catch (err) {
      toastError(
        'Upload failed',
        err instanceof Error ? err.message : 'Could not upload background'
      );
    } finally {
      setUploadingBg(false);
    }
  }

  function resetBackground() {
    if (!canEdit || !layout) return;
    touchLayout((prev) => ({
      ...prev,
      backgroundUrl: DEFAULT_FLOOR_PLAN_BG,
      backgroundPathname: null,
      backgroundName: 'default-floor-plan.svg'
    }));
    success('Restored default floor plate');
  }

  async function exportPng() {
    const stage = stageRef.current;
    if (!stage) {
      toastError('Export failed', 'Canvas is not ready yet.');
      return;
    }
    setExporting(true);
    try {
      // Temporarily reset transform for full-canvas export at 1:1
      const oldScale = { x: stage.scaleX(), y: stage.scaleY() };
      const oldPos = { x: stage.x(), y: stage.y() };
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      const dataUrl = stage.toDataURL({
        pixelRatio: 2,
        mimeType: 'image/png',
        x: 0,
        y: 0,
        width: layout?.canvasWidth,
        height: layout?.canvasHeight
      });
      stage.scale(oldScale);
      stage.position(oldPos);
      stage.batchDraw();

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(layout?.name || 'floor-plan').replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
      success('Exported PNG');
    } catch (err) {
      toastError(
        'Export failed',
        err instanceof Error ? err.message : 'Could not export image'
      );
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    const stage = stageRef.current;
    if (!stage || !layout) {
      toastError('Export failed', 'Canvas is not ready yet.');
      return;
    }
    setExporting(true);
    try {
      const oldScale = { x: stage.scaleX(), y: stage.scaleY() };
      const oldPos = { x: stage.x(), y: stage.y() };
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      const dataUrl = stage.toDataURL({
        pixelRatio: 2,
        mimeType: 'image/png',
        x: 0,
        y: 0,
        width: layout.canvasWidth,
        height: layout.canvasHeight
      });
      stage.scale(oldScale);
      stage.position(oldPos);
      stage.batchDraw();

      const w = window.open('', '_blank', 'noopener,noreferrer');
      if (!w) {
        throw new Error('Popup blocked. Allow popups to export PDF.');
      }
      w.document.write(`<!DOCTYPE html><html><head><title>${layout.name}</title>
<style>
  @page { size: landscape; margin: 12mm; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #0f1115; color: #eef1f6; }
  h1 { font-size: 16px; margin: 12px 16px 8px; }
  p { font-size: 12px; color: #8b93a7; margin: 0 16px 12px; }
  img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
</style></head><body>
<h1>${layout.name.replace(/</g, '')} — Steam × Diamond</h1>
<p>${(layout.description || 'Floor plan layout').replace(/</g, '')}</p>
<img src="${dataUrl}" alt="Floor plan" onload="setTimeout(function(){window.print()}, 250)" />
</body></html>`);
      w.document.close();
      success('Print dialog opened', 'Choose “Save as PDF” in the print dialog.');
    } catch (err) {
      toastError(
        'Export failed',
        err instanceof Error ? err.message : 'Could not export PDF'
      );
    } finally {
      setExporting(false);
    }
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!layout || !user?.id) return;
    const body = commentBody.trim();
    if (!body) return;
    addFloorPlanComment(layout.id, {
      parentId: replyTo,
      authorId: user.id,
      authorName: displayName,
      body
    });
    setCommentBody('');
    setReplyTo(null);
    success('Comment posted');
  }

  const comments = layout?.comments || [];
  const topComments = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const selectedItem = layout?.items.find((i) => i.id === selectedId) || null;

  if (!layout) {
    return (
      <div className="space-y-4">
        <h2 className="section-title">Floor Plan Builder</h2>
        <div className="panel empty-state">
          No layouts yet.
          {canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm mt-4"
              onClick={() => {
                const next = emptyLayout('Initial Concept');
                setData((d) => ({
                  ...d,
                  floorPlans: [next],
                  activeFloorPlanId: next.id
                }));
                setActiveId(next.id);
              }}
            >
              Create first layout
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Floor Plan Builder</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            {layout.name}
            {layout.updatedAt ? ` · Updated ${formatDateTime(layout.updatedAt)}` : ''}
            {layout.updatedByName ? ` · ${layout.updatedByName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={exporting}
            onClick={() => void exportPng()}
          >
            Export PNG
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={exporting}
            onClick={() => void exportPdf()}
          >
            Export PDF
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={uploadingBg}
                onClick={() => bgInputRef.current?.click()}
              >
                {uploadingBg ? 'Uploading…' : 'Upload plan'}
              </button>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*,.svg,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadBackground(f);
                }}
              />
              <button type="button" className="btn-ghost btn-sm" onClick={resetBackground}>
                Default plan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {canEdit && selectedItem && (
        <div className="flex flex-wrap items-center gap-1.5 panel px-3 py-2">
          <span className="text-xs font-semibold text-ink-muted">Selected:</span>
          <span className="text-sm font-medium">{selectedItem.label}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => rotateSelected(-15)}>
            ↺ 15°
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => rotateSelected(15)}>
            ↻ 15°
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={bringToFront}>
            Bring front
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={sendToBack}>
            Send back
          </button>
          <button type="button" className="btn-danger" onClick={deleteSelected}>
            Delete
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={layout.snapToGrid}
              onChange={(e) =>
                touchLayout((prev) => ({ ...prev, snapToGrid: e.target.checked }))
              }
            />
            Snap to grid
          </label>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-surface-600 bg-surface-800/80 px-3 py-2 text-xs text-ink-dim">
          View only — you can pan, zoom, and comment. Editors place furniture and save layouts.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="flex max-h-[min(78vh,860px)] flex-col panel overflow-hidden">
          <div className="flex border-b border-surface-600">
            {(
              [
                { id: 'library' as const, label: 'Library' },
                { id: 'layouts' as const, label: 'Layouts' },
                { id: 'comments' as const, label: 'Comments' }
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex-1 px-2 py-2.5 text-xs font-semibold transition ${
                  sideTab === t.id
                    ? 'border-b-2 border-amber-400 text-amber-300'
                    : 'text-ink-muted hover:text-ink'
                }`}
                onClick={() => setSideTab(t.id)}
              >
                {t.label}
                {t.id === 'comments' && comments.length > 0 ? ` (${comments.length})` : ''}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === 'library' && (
              <div className="space-y-3">
                {!canEdit && (
                  <p className="text-[11px] text-ink-dim">
                    Sign in as editor to drag items onto the plan.
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${
                      category === 'all'
                        ? 'bg-amber-400 text-surface-950'
                        : 'bg-surface-700 text-ink-muted'
                    }`}
                    onClick={() => setCategory('all')}
                  >
                    All
                  </button>
                  {FLOOR_PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${
                        category === c.id
                          ? 'bg-amber-400 text-surface-950'
                          : 'bg-surface-700 text-ink-muted'
                      }`}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {catalogFiltered.map((item) => (
                    <button
                      key={item.typeId}
                      type="button"
                      draggable={canEdit}
                      disabled={!canEdit}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/x-sdh-floorplan-type',
                          item.typeId
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => {
                        if (canEdit) addItemCentered(item.typeId);
                      }}
                      className="panel-inset flex flex-col items-start gap-1 px-2.5 py-2 text-left transition hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                      title={canEdit ? 'Drag onto plan or click to place' : item.label}
                    >
                      <span className="text-base leading-none" style={{ color: item.stroke }}>
                        {item.symbol}
                      </span>
                      <span className="text-[11px] font-semibold leading-tight text-ink">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sideTab === 'layouts' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => {
                          setLayoutForm({ name: '', description: '' });
                          setModal('new-layout');
                        }}
                      >
                        + New
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={duplicateLayout}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setLayoutForm({
                            name: layout.name,
                            description: layout.description || ''
                          });
                          setModal('rename');
                        }}
                      >
                        Rename
                      </button>
                      <button type="button" className="btn-danger" onClick={deleteLayout}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {layouts.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => selectLayout(l.id)}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                          l.id === layout.id
                            ? 'border-amber-400/40 bg-amber-400/10'
                            : 'border-surface-600 bg-surface-950/40 hover:border-surface-500'
                        }`}
                      >
                        <div className="text-sm font-semibold">{l.name}</div>
                        <div className="mt-0.5 text-[11px] text-ink-dim">
                          {l.items.length} item{l.items.length === 1 ? '' : 's'}
                          {l.comments.length
                            ? ` · ${l.comments.length} comment${l.comments.length === 1 ? '' : 's'}`
                            : ''}
                        </div>
                        {l.description && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted">
                            {l.description}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sideTab === 'comments' && (
              <div className="space-y-3">
                <p className="text-[11px] text-ink-dim">
                  Any signed-in role can leave feedback on this layout.
                </p>
                {topComments.length === 0 ? (
                  <p className="text-sm text-ink-dim">No comments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {topComments
                      .slice()
                      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                      .map((c) => (
                        <li key={c.id} className="space-y-1.5">
                          <div className="rounded-lg border border-surface-600 bg-surface-950/50 px-2.5 py-2">
                            <div className="flex justify-between gap-2">
                              <span className="text-xs font-semibold">{c.authorName}</span>
                              <span className="text-[10px] text-ink-dim">
                                {formatDateTime(c.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">
                              {c.body}
                            </p>
                            <button
                              type="button"
                              className="btn-ghost btn-sm mt-1 !px-1 text-[10px]"
                              onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                            >
                              {replyTo === c.id ? 'Cancel' : 'Reply'}
                            </button>
                          </div>
                          {repliesOf(c.id).map((r) => (
                            <div
                              key={r.id}
                              className="ml-3 rounded-lg border border-surface-600 bg-surface-900/60 px-2.5 py-2"
                            >
                              <div className="flex justify-between gap-2">
                                <span className="text-xs font-semibold">{r.authorName}</span>
                                <span className="text-[10px] text-ink-dim">
                                  {formatDateTime(r.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">
                                {r.body}
                              </p>
                            </div>
                          ))}
                        </li>
                      ))}
                  </ul>
                )}
                <form onSubmit={submitComment} className="space-y-2 border-t border-surface-600 pt-3">
                  {replyTo && (
                    <div className="text-[11px] text-amber-200">
                      Replying…
                      <button
                        type="button"
                        className="btn-ghost btn-sm ml-1"
                        onClick={() => setReplyTo(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <textarea
                    className="input min-h-[4.5rem] text-sm"
                    placeholder={user ? 'Comment on this layout…' : 'Sign in to comment'}
                    value={commentBody}
                    disabled={!user}
                    onChange={(e) => setCommentBody(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn-primary btn-sm w-full"
                    disabled={!user || !commentBody.trim()}
                  >
                    Post comment
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <div className="panel flex min-h-[min(70vh,720px)] flex-col overflow-hidden lg:min-h-[min(78vh,860px)]">
          <FloorPlanCanvas
            layout={layout}
            canEdit={canEdit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onItemsChange={setItems}
            onPlaceFromLibrary={placeFromLibrary}
            stageRef={stageRef}
          />
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-dim lg:hidden">
        Tip: use Library tab to place items · scroll to zoom on the canvas
      </p>

      <Modal
        open={modal === 'new-layout' || modal === 'rename'}
        title={modal === 'new-layout' ? 'New layout version' : 'Rename layout'}
        onClose={() => setModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (modal === 'new-layout') createLayout();
            else renameLayout();
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              required
              placeholder='e.g. Initial Concept, Final Layout'
              value={layoutForm.name}
              onChange={(e) => setLayoutForm({ ...layoutForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[4rem]"
              placeholder="Notes for the team…"
              value={layoutForm.description}
              onChange={(e) =>
                setLayoutForm({ ...layoutForm, description: e.target.value })
              }
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            {modal === 'new-layout' ? 'Create layout' : 'Save'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
