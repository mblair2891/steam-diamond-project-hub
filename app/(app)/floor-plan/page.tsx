'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { useToast } from '@/components/ToastProvider';
import { useRole } from '@/hooks/useRole';
import { uploadToBlob } from '@/lib/blob-upload';
import {
  copyFloorPlan,
  createFloorPlan,
  deleteFloorPlan,
  fetchFloorPlans,
  FLOORPLANS_CHANGED,
  postFloorPlanComment,
  updateFloorPlan
} from '@/lib/floorplans-client';
import {
  DEFAULT_FLOOR_PLAN_BG,
  FLOOR_PLAN_CATALOG,
  FLOOR_PLAN_CATEGORIES,
  getCatalogItem,
  type FloorPlanCategory
} from '@/lib/floorplan-catalog';
import {
  fitCanvasSize,
  isImageFile,
  isPdfFile,
  prepareDrawingForCanvas
} from '@/lib/floorplan-background';
import {
  detectArchitecture,
  mergeAutoDrawings
} from '@/lib/floorplan-detect';
import { uid } from '@/lib/dates';
import type {
  FloorPlanDrawing,
  FloorPlanLayout,
  FloorPlanPlacedItem,
  FloorPlanTool
} from '@/lib/types';
import type { FloorPlanStageHandle } from '@/components/floorplan/types';

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

type VersionFilter = 'mine' | 'all' | 'user';

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

const TOOLS: { id: FloorPlanTool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Move / resize / rotate' },
  { id: 'wall', label: 'Wall', hint: 'Click-drag to draw' },
  { id: 'door', label: 'Door', hint: 'Click to place' },
  { id: 'window', label: 'Window', hint: 'Click to place' },
  { id: 'room-label', label: 'Label', hint: 'Click to add text' },
  { id: 'delete', label: 'Delete', hint: 'Click item to remove' },
  { id: 'pan', label: 'Pan', hint: 'Drag canvas' }
];

function upsertLocal(list: FloorPlanLayout[], layout: FloorPlanLayout): FloorPlanLayout[] {
  const idx = list.findIndex((l) => l.id === layout.id);
  if (idx < 0) return [layout, ...list];
  const next = [...list];
  next[idx] = layout;
  return next;
}

export default function FloorPlanPage() {
  const { canEdit, isAdmin, user, displayName } = useRole();
  const { success, error: toastError } = useToast();

  const [layouts, setLayouts] = useState<FloorPlanLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [versionFilter, setVersionFilter] = useState<VersionFilter>('all');
  const [userFilter, setUserFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<FloorPlanTool>('select');
  const [category, setCategory] = useState<FloorPlanCategory | 'all'>('all');
  const [sideTab, setSideTab] = useState<'versions' | 'tools' | 'library' | 'comments'>(
    'versions'
  );

  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | 'rename' | null>(null);
  const [layoutForm, setLayoutForm] = useState({ name: '', description: '' });
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadPhase, setUploadPhase] = useState('');
  const [drawingBanner, setDrawingBanner] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<FloorPlanStageHandle | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    setListError(null);
    try {
      const result = await fetchFloorPlans();
      if (result.error) {
        setListError(result.error);
        setLayouts([]);
      } else {
        setLayouts(result.layouts);
        setActiveId((prev) => {
          if (prev && result.layouts.some((l) => l.id === prev)) return prev;
          const mine = result.layouts.find((l) => l.ownerId === user?.id);
          return mine?.id || result.layouts[0]?.id || null;
        });
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load floor plans');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChange = () => void load(true);
    window.addEventListener(FLOORPLANS_CHANGED, onChange);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener(FLOORPLANS_CHANGED, onChange);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const layout = layouts.find((l) => l.id === activeId) || null;
  const isOwner = Boolean(layout && user?.id && layout.ownerId === user.id);
  const canEditLayout = Boolean(canEdit && layout && (isOwner || isAdmin));

  // When opening a version that already has a drawing, surface the edit CTA
  useEffect(() => {
    if (layout?.drawingReady && canEditLayout) {
      setDrawingBanner(true);
    } else if (!layout?.drawingReady) {
      setDrawingBanner(false);
    }
  }, [layout?.id, layout?.drawingReady, canEditLayout]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of layouts) {
      if (l.ownerId) map.set(l.ownerId, l.ownerName || 'User');
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [layouts]);

  const filteredLayouts = useMemo(() => {
    let list = [...layouts];
    if (versionFilter === 'mine' && user?.id) {
      list = list.filter((l) => l.ownerId === user.id);
    } else if (versionFilter === 'user' && userFilter) {
      list = list.filter((l) => l.ownerId === userFilter);
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [layouts, versionFilter, userFilter, user?.id]);

  const catalogFiltered = useMemo(() => {
    if (category === 'all') return FLOOR_PLAN_CATALOG;
    return FLOOR_PLAN_CATALOG.filter((c) => c.category === category);
  }, [category]);

  /** Debounced cloud save for owner edits */
  const persistLayout = useCallback(
    (next: FloorPlanLayout, immediate = false) => {
      if (!canEditLayout) return;
      setLayouts((list) => upsertLocal(list, next));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const run = async () => {
        setSaving(true);
        try {
          const saved = await updateFloorPlan(next.id, {
            name: next.name,
            description: next.description,
            backgroundUrl: next.backgroundUrl,
            backgroundPathname: next.backgroundPathname,
            backgroundName: next.backgroundName,
            backgroundMime: next.backgroundMime,
            sourcePdfUrl: next.sourcePdfUrl,
            sourcePdfPathname: next.sourcePdfPathname,
            sourcePdfName: next.sourcePdfName,
            drawingReady: next.drawingReady,
            canvasWidth: next.canvasWidth,
            canvasHeight: next.canvasHeight,
            gridSize: next.gridSize,
            snapToGrid: next.snapToGrid,
            wallThickness: next.wallThickness,
            wallColor: next.wallColor,
            items: next.items,
            drawings: next.drawings
          });
          setLayouts((list) => upsertLocal(list, saved));
        } catch (err) {
          toastError(
            'Save failed',
            err instanceof Error ? err.message : 'Could not sync layout'
          );
        } finally {
          setSaving(false);
        }
      };
      if (immediate) void run();
      else saveTimer.current = setTimeout(() => void run(), 600);
    },
    [canEditLayout, toastError]
  );

  const touch = useCallback(
    (updater: (prev: FloorPlanLayout) => FloorPlanLayout) => {
      if (!layout || !canEditLayout) return;
      const next = {
        ...updater(layout),
        updatedAt: new Date().toISOString(),
        updatedByName: displayName || layout.ownerName
      };
      persistLayout(next);
    },
    [layout, canEditLayout, displayName, persistLayout]
  );

  const setItems = useCallback(
    (items: FloorPlanPlacedItem[]) => touch((p) => ({ ...p, items })),
    [touch]
  );
  const setDrawings = useCallback(
    (drawings: FloorPlanDrawing[]) => touch((p) => ({ ...p, drawings })),
    [touch]
  );

  function placeFromLibrary(typeId: string, x: number, y: number) {
    if (!layout || !canEditLayout) return;
    const cat = getCatalogItem(typeId);
    if (!cat) return;
    const maxZ = Math.max(
      0,
      ...layout.items.map((i) => i.zIndex),
      ...layout.drawings.map((d) => d.zIndex)
    );
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
    setTool('select');
  }

  function addDrawing(drawing: FloorPlanDrawing) {
    if (!layout || !canEditLayout) return;
    setDrawings([...(layout.drawings || []), drawing]);
  }

  function deleteSelected() {
    if (!layout || !selectedId || !canEditLayout) return;
    if (layout.items.some((i) => i.id === selectedId)) {
      setItems(layout.items.filter((i) => i.id !== selectedId));
    } else {
      setDrawings(layout.drawings.filter((d) => d.id !== selectedId));
    }
    setSelectedId(null);
  }

  async function handleCreate() {
    if (!canEdit) return;
    const name = layoutForm.name.trim() || 'Concept A';
    try {
      const created = await createFloorPlan({
        name,
        description: layoutForm.description.trim(),
        backgroundUrl: layout?.backgroundUrl || DEFAULT_FLOOR_PLAN_BG,
        backgroundPathname: layout?.backgroundPathname || null,
        backgroundName: layout?.backgroundName || 'default-floor-plan.svg'
      });
      setLayouts((list) => upsertLocal(list, created));
      setActiveId(created.id);
      setModal(null);
      setLayoutForm({ name: '', description: '' });
      setSideTab('tools');
      success('Personal version created', `Owned by ${created.ownerName}`);
    } catch (err) {
      toastError(
        'Create failed',
        err instanceof Error ? err.message : 'Could not create version'
      );
    }
  }

  async function handleRename() {
    if (!layout || !canEditLayout) return;
    const name = layoutForm.name.trim();
    if (!name) return;
    try {
      const saved = await updateFloorPlan(layout.id, {
        name,
        description: layoutForm.description.trim()
      });
      setLayouts((list) => upsertLocal(list, saved));
      setModal(null);
      success('Version renamed');
    } catch (err) {
      toastError('Rename failed', err instanceof Error ? err.message : 'Could not rename');
    }
  }

  async function handleCopy(sourceId?: string) {
    if (!canEdit) return;
    const id = sourceId || layout?.id;
    if (!id) return;
    try {
      const copied = await copyFloorPlan(id);
      setLayouts((list) => upsertLocal(list, copied));
      setActiveId(copied.id);
      setSideTab('tools');
      success('Copied to your versions', 'Edits only affect your personal copy');
    } catch (err) {
      toastError('Copy failed', err instanceof Error ? err.message : 'Could not copy');
    }
  }

  async function handleDelete() {
    if (!layout || !canEditLayout) return;
    if (!confirm(`Delete your version “${layout.name}”?`)) return;
    try {
      await deleteFloorPlan(layout.id);
      setLayouts((list) => list.filter((l) => l.id !== layout.id));
      setActiveId(null);
      success('Version deleted');
    } catch (err) {
      toastError('Delete failed', err instanceof Error ? err.message : 'Could not delete');
    }
  }

  async function uploadBackground(file: File) {
    if (!canEditLayout || !layout) return;
    if (!isImageFile(file) && !isPdfFile(file)) {
      toastError('Unsupported file', 'Upload a PDF or image (PNG, JPG, WebP, SVG).');
      return;
    }

    setUploadingBg(true);
    setUploadPhase('Preparing drawing…');
    setDrawingBanner(false);

    try {
      // 1) Convert PDF → PNG (or measure image) so Konva can display it
      const prepared = await prepareDrawingForCanvas(file, (msg) => setUploadPhase(msg));

      // 2) Optionally keep original PDF in Blob for reference
      let sourcePdf: {
        url: string | null;
        pathname: string | null;
        name: string | null;
      } = {
        url: layout.sourcePdfUrl ?? null,
        pathname: layout.sourcePdfPathname ?? null,
        name: layout.sourcePdfName ?? null
      };

      if (isPdfFile(file)) {
        setUploadPhase('Uploading original PDF…');
        try {
          const pdfResult = await uploadToBlob({
            file,
            folder: 'floorplans',
            onProgress: (pct) => setUploadPhase(`Uploading original PDF… ${pct}%`)
          });
          sourcePdf = {
            url: pdfResult.url,
            pathname: pdfResult.pathname,
            name: pdfResult.name || file.name
          };
        } catch {
          // Non-fatal — editable PNG is the source of truth for the canvas
        }
      }

      // 3) Upload raster (or original image) as the editable background
      setUploadPhase(
        prepared.sourceKind === 'pdf'
          ? 'Uploading editable drawing…'
          : 'Uploading image…'
      );
      const result = await uploadToBlob({
        file: prepared.file,
        folder: 'floorplans',
        onProgress: (pct) =>
          setUploadPhase(
            prepared.sourceKind === 'pdf'
              ? `Uploading editable drawing… ${pct}%`
              : `Uploading image… ${pct}%`
          )
      });

      const { canvasWidth, canvasHeight } = fitCanvasSize(prepared.width, prepared.height);

      // 4) OpenAI Vision (server) detects walls/doors/windows; CV is fallback
      setUploadPhase('Sending drawing to OpenAI Vision…');
      const detected = await detectArchitecture(
        prepared.file,
        canvasWidth,
        canvasHeight,
        layout.wallThickness || 10,
        (msg) => setUploadPhase(msg)
      );
      const drawings = mergeAutoDrawings(layout.drawings || [], detected, true);
      const autoCount =
        detected.walls.length + detected.doors.length + detected.windows.length;
      setUploadPhase(
        `Placing ${detected.walls.length} walls, ${detected.doors.length} doors, ${detected.windows.length} windows…`
      );

      if (autoCount === 0) {
        // detectArchitecture is designed to always return walls — hard fail if not
        throw new Error(
          'Automatic detection produced no elements. Try a clearer floor plan image (dark lines on light background).'
        );
      }

      const next: FloorPlanLayout = {
        ...layout,
        backgroundUrl: result.url,
        backgroundPathname: result.pathname,
        backgroundName: result.name || prepared.file.name,
        backgroundMime: result.contentType || prepared.file.type || 'image/png',
        sourcePdfUrl: sourcePdf.url,
        sourcePdfPathname: sourcePdf.pathname,
        sourcePdfName: sourcePdf.name,
        canvasWidth,
        canvasHeight,
        drawings,
        drawingReady: true,
        updatedAt: new Date().toISOString(),
        updatedByName: displayName || layout.ownerName
      };

      // Immediate local state so canvas shows auto objects before cloud save finishes
      setLayouts((list) => upsertLocal(list, next));
      setActiveId(next.id);

      setUploadPhase('Saving personal version…');
      persistLayout(next, true);

      // 5) Jump into editing mode
      setTool('select');
      setSideTab('tools');
      setSelectedId(null);
      setDrawingBanner(true);
      const methodLabel =
        detected.method === 'openai-vision'
          ? 'OpenAI Vision'
          : detected.method === 'openai+cv'
            ? 'OpenAI + CV'
            : 'Local CV (OpenAI fallback)';
      success(
        `${methodLabel}: ${detected.walls.length} walls · ${detected.doors.length} doors · ${detected.windows.length} windows`,
        `${detected.message || ''} Purple/cyan “Auto” elements are fully editable.`
      );
      if (detected.openaiError && detected.method !== 'openai-vision') {
        // Soft notice — detection still succeeded via fallback
        console.warn('[floor-plan] OpenAI Vision fallback:', detected.openaiError);
      }
    } catch (err) {
      toastError(
        'Upload failed',
        err instanceof Error ? err.message : 'Could not prepare floor plan drawing'
      );
    } finally {
      setUploadingBg(false);
      setUploadPhase('');
    }
  }

  function startEditing() {
    setTool('select');
    setSideTab('library');
    setDrawingBanner(false);
    success(
      'Ready to edit',
      'Purple/cyan “Auto” elements are AI-detected — move, resize, or delete them. Add furniture from the Library.'
    );
  }

  async function rerunDetection() {
    if (!layout || !canEditLayout) return;
    const bgRef = layout.backgroundPathname || layout.backgroundUrl;
    if (!bgRef || bgRef === DEFAULT_FLOOR_PLAN_BG) {
      toastError('No drawing', 'Upload a building PDF or image first.');
      return;
    }
    setUploadingBg(true);
    setUploadPhase('Loading drawing for analysis…');
    try {
      const path = layout.backgroundPathname || layout.backgroundUrl || '';
      let fetchUrl = path;
      if (path.startsWith('/floor-plans/')) {
        fetchUrl = path;
      } else if (path && !path.startsWith('http') && !path.startsWith('/')) {
        fetchUrl = `/api/media/stream?pathname=${encodeURIComponent(path)}&disposition=inline`;
      } else if (
        path.includes('blob.vercel-storage.com') ||
        /^(floorplans|media|documents|uploads)\//i.test(path)
      ) {
        const q = path.includes('://')
          ? `url=${encodeURIComponent(path.split('?')[0])}`
          : `pathname=${encodeURIComponent(path)}`;
        fetchUrl = `/api/media/stream?${q}&disposition=inline`;
      }
      const res = await fetch(fetchUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load background for analysis (${res.status}).`);
      const blob = await res.blob();
      const file = new File([blob], layout.backgroundName || 'drawing.png', {
        type: blob.type || 'image/png'
      });
      const detected = await detectArchitecture(
        file,
        layout.canvasWidth,
        layout.canvasHeight,
        layout.wallThickness || 10,
        (msg) => setUploadPhase(msg)
      );
      const drawings = mergeAutoDrawings(layout.drawings || [], detected, true);
      if (!detected.walls.length) {
        throw new Error('Detection returned no walls. Try a higher-contrast plan image.');
      }
      const next = {
        ...layout,
        drawings,
        drawingReady: true,
        updatedAt: new Date().toISOString(),
        updatedByName: displayName || layout.ownerName
      };
      setLayouts((list) => upsertLocal(list, next));
      persistLayout(next, true);
      setDrawingBanner(true);
      setTool('select');
      success(
        `Auto-detected ${detected.walls.length} walls · ${detected.doors.length} doors · ${detected.windows.length} windows`,
        detected.message || 'Purple/cyan “Auto” elements are ready to fine-tune.'
      );
    } catch (err) {
      toastError(
        'Detection failed',
        err instanceof Error ? err.message : 'Could not analyze drawing'
      );
    } finally {
      setUploadingBg(false);
      setUploadPhase('');
    }
  }

  function resetBackground() {
    if (!canEditLayout || !layout) return;
    touch((p) => ({
      ...p,
      backgroundUrl: DEFAULT_FLOOR_PLAN_BG,
      backgroundPathname: null,
      backgroundName: 'default-floor-plan.svg',
      backgroundMime: 'image/svg+xml',
      sourcePdfUrl: null,
      sourcePdfPathname: null,
      sourcePdfName: null,
      drawingReady: false
    }));
    setDrawingBanner(false);
    success('Restored default plate');
  }

  async function exportPng() {
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
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${layout.ownerName}-${layout.name}`
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '') + '.png';
      a.click();
      success('Exported PNG');
    } catch (err) {
      toastError('Export failed', err instanceof Error ? err.message : 'Could not export');
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
      if (!w) throw new Error('Popup blocked. Allow popups to export PDF.');
      w.document.write(`<!DOCTYPE html><html><head><title>${layout.name}</title>
<style>
@page { size: landscape; margin: 12mm; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0f1115; color: #eef1f6; }
h1 { font-size: 16px; margin: 12px 16px 8px; }
p { font-size: 12px; color: #8b93a7; margin: 0 16px 12px; }
img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
</style></head><body>
<h1>${layout.name.replace(/</g, '')} — ${layout.ownerName.replace(/</g, '')}</h1>
<p>Steam × Diamond Floor Plan · ${formatDateTime(layout.updatedAt)}</p>
<img src="${dataUrl}" alt="Floor plan" onload="setTimeout(function(){window.print()},250)" />
</body></html>`);
      w.document.close();
      success('Print dialog opened', 'Choose “Save as PDF”');
    } catch (err) {
      toastError('Export failed', err instanceof Error ? err.message : 'Could not export');
    } finally {
      setExporting(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!layout || !user?.id) return;
    const body = commentBody.trim();
    if (!body) return;
    try {
      const { layout: saved } = await postFloorPlanComment(layout.id, {
        body,
        parentId: replyTo,
        authorName: displayName
      });
      setLayouts((list) => upsertLocal(list, saved));
      setCommentBody('');
      setReplyTo(null);
      success('Comment posted');
    } catch (err) {
      toastError('Comment failed', err instanceof Error ? err.message : 'Could not post');
    }
  }

  const comments = layout?.comments || [];
  const topComments = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const selectedItem = layout?.items.find((i) => i.id === selectedId);
  const selectedDrawing = layout?.drawings.find((d) => d.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Floor Plan Builder</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Personal versions · multi-user collaboration · never overwrites others
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={loading}
            onClick={() => void load(true)}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={exporting || !layout}
            onClick={() => void exportPng()}
          >
            Export PNG
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={exporting || !layout}
            onClick={() => void exportPdf()}
          >
            Export PDF
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                setLayoutForm({ name: 'Concept A', description: '' });
                setModal('new');
              }}
            >
              + My version
            </button>
          )}
        </div>
      </div>

      {listError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <strong>Could not load floor plans.</strong> {listError}
        </div>
      )}

      {layout && (
        <div className="flex flex-wrap items-center gap-2 panel px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{layout.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
              <span className="badge badge-role">{layout.ownerName}</span>
              <span>Updated {formatDateTime(layout.updatedAt)}</span>
              {layout.copiedFromOwnerName && (
                <span>· Copied from {layout.copiedFromOwnerName}</span>
              )}
              {saving && <span className="text-amber-300">· Saving…</span>}
              {canEditLayout ? (
                <span className="text-emerald-400">· Your editable version</span>
              ) : (
                <span className="text-ink-muted">· Read-only (copy to edit)</span>
              )}
              {layout.drawingReady && (
                <span className="badge badge-approved">Drawing ready</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {canEdit && !isOwner && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void handleCopy()}
              >
                Copy to my versions
              </button>
            )}
            {canEditLayout && (
              <>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={uploadingBg}
                  onClick={() => bgInputRef.current?.click()}
                >
                  {uploadingBg ? 'Working…' : 'Upload drawing'}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={uploadingBg || !layout.drawingReady}
                  onClick={() => void rerunDetection()}
                  title="Re-run AI / local wall-door-window detection"
                >
                  Auto-detect
                </button>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*,.svg,.png,.jpg,.jpeg,.webp,application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadBackground(f);
                  }}
                />
                <button type="button" className="btn-ghost btn-sm" onClick={resetBackground}>
                  Default plate
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
                <button type="button" className="btn-danger" onClick={() => void handleDelete()}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {uploadingBg && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <div className="text-sm font-medium text-amber-200">
            {uploadPhase || 'Processing building drawing…'}
          </div>
          <p className="mt-1 text-[11px] text-amber-200/80">
            Converting the plan, then analyzing with OpenAI Vision to auto-place walls, doors, and
            windows as editable objects. This can take a few seconds.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-900">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-400" />
          </div>
        </div>
      )}

      {drawingBanner && layout && !uploadingBg && canEditLayout && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-emerald-200">
              Walls, doors, and windows were auto-detected
            </div>
            <p className="mt-0.5 text-[11px] text-emerald-200/80">
              Purple walls and cyan openings with an <strong>Auto</strong> label are
              computer-vision results — select, move, resize, rotate, or delete them. Use manual
              tools for fixes and the Library for furniture.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <button type="button" className="btn-primary btn-sm" onClick={startEditing}>
              Start Editing
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setDrawingBanner(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Drawing toolbar */}
      {layout && canEditLayout && (
        <div className="flex flex-wrap items-center gap-1.5 panel px-3 py-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                tool === t.id
                  ? 'bg-amber-400 text-surface-950'
                  : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink'
              }`}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-surface-600" />
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <input
              type="checkbox"
              checked={layout.snapToGrid}
              onChange={(e) => touch((p) => ({ ...p, snapToGrid: e.target.checked }))}
            />
            Snap
          </label>
          <label className="flex items-center gap-1 text-[11px] text-ink-muted">
            Wall
            <input
              type="color"
              className="h-6 w-8 cursor-pointer rounded border border-surface-600 bg-transparent"
              value={layout.wallColor || '#e8b84a'}
              onChange={(e) => touch((p) => ({ ...p, wallColor: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-ink-muted">
            Thick
            <input
              type="range"
              min={4}
              max={28}
              value={layout.wallThickness || 10}
              className="w-20"
              onChange={(e) =>
                touch((p) => ({ ...p, wallThickness: Number(e.target.value) }))
              }
            />
            <span className="tabular-nums">{layout.wallThickness || 10}</span>
          </label>
          {(selectedItem || selectedDrawing) && tool === 'select' && (
            <button type="button" className="btn-danger ml-auto" onClick={deleteSelected}>
              Delete selection
            </button>
          )}
        </div>
      )}

      {!canEdit && (
        <div className="rounded-lg border border-surface-600 bg-surface-800/80 px-3 py-2 text-xs text-ink-dim">
          View only — browse everyone’s versions and leave comments. Contact an admin for edit
          access to create personal versions.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
        <aside className="flex max-h-[min(78vh,900px)] flex-col panel overflow-hidden">
          <div className="flex border-b border-surface-600">
            {(
              [
                { id: 'versions' as const, label: 'Versions' },
                { id: 'tools' as const, label: 'Tools' },
                { id: 'library' as const, label: 'Library' },
                { id: 'comments' as const, label: 'Chat' }
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex-1 px-1.5 py-2.5 text-[11px] font-semibold transition ${
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
            {sideTab === 'versions' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: 'all' as const, label: 'All' },
                      { id: 'mine' as const, label: 'Mine' },
                      { id: 'user' as const, label: 'By user' }
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${
                        versionFilter === f.id
                          ? 'bg-amber-400 text-surface-950'
                          : 'bg-surface-700 text-ink-muted'
                      }`}
                      onClick={() => setVersionFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {versionFilter === 'user' && (
                  <select
                    className="input py-1.5 text-xs"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                  >
                    <option value="">Select user…</option>
                    {owners.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                {loading ? (
                  <p className="text-sm text-ink-dim">Loading versions…</p>
                ) : filteredLayouts.length === 0 ? (
                  <div className="empty-state !py-6">
                    {canEdit
                      ? 'No versions yet. Create your personal version to start.'
                      : 'No shared versions yet.'}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {filteredLayouts.map((l) => {
                      const mine = user?.id === l.ownerId;
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveId(l.id);
                              setSelectedId(null);
                            }}
                            className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                              l.id === layout?.id
                                ? 'border-amber-400/40 bg-amber-400/10'
                                : 'border-surface-600 bg-surface-950/40 hover:border-surface-500'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{l.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span className="badge badge-role">{l.ownerName}</span>
                                  {mine && (
                                    <span className="badge badge-approved">Mine</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-1.5 text-[10px] text-ink-dim">
                              {formatDateTime(l.updatedAt)}
                              {' · '}
                              {l.items.length} furn.
                              {l.drawings?.length
                                ? ` · ${l.drawings.length} draw`
                                : ''}
                              {l.comments.length
                                ? ` · ${l.comments.length} notes`
                                : ''}
                            </div>
                            {canEdit && !mine && (
                              <span
                                className="mt-1.5 inline-block text-[10px] font-semibold text-amber-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleCopy(l.id);
                                }}
                                role="button"
                              >
                                Copy to mine →
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {sideTab === 'tools' && (
              <div className="space-y-3 text-sm text-ink-muted">
                <p className="text-xs">
                  {canEditLayout
                    ? 'Use the toolbar above the canvas. Walls are click-drag; doors, windows, and labels are click-to-place.'
                    : 'Switch to one of your versions or copy this plan to edit.'}
                </p>
                <ul className="space-y-1.5 text-xs">
                  {TOOLS.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2 panel-inset px-2 py-1.5">
                      <span className="font-semibold text-ink">{t.label}</span>
                      <span className="text-ink-dim">{t.hint}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-dim">
                  Upload a PDF or image. We convert it and run <strong>OpenAI Vision</strong> to
                  detect walls, doors, and windows (local CV fallback if the API is unavailable).
                  Fine-tune the Auto elements, then add furniture.
                </p>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="badge" style={{ borderColor: '#c084fc55', color: '#e9d5ff' }}>
                    Auto wall
                  </span>
                  <span className="badge" style={{ borderColor: '#a78bfa55', color: '#ddd6fe' }}>
                    Auto door
                  </span>
                  <span className="badge" style={{ borderColor: '#22d3ee55', color: '#a5f3fc' }}>
                    Auto window
                  </span>
                </div>
                {canEditLayout && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      className="btn-primary btn-sm w-full"
                      disabled={uploadingBg}
                      onClick={() => bgInputRef.current?.click()}
                    >
                      {uploadingBg ? 'Loading drawing…' : 'Upload building drawing'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm w-full"
                      disabled={uploadingBg || !layout?.drawingReady}
                      onClick={() => void rerunDetection()}
                    >
                      Re-run auto-detect
                    </button>
                  </div>
                )}
              </div>
            )}

            {sideTab === 'library' && (
              <div className="space-y-3">
                {!canEditLayout && (
                  <p className="text-[11px] text-ink-dim">
                    Furniture can only be placed on versions you own. Copy this plan first.
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
                      draggable={canEditLayout}
                      disabled={!canEditLayout}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/x-sdh-floorplan-type',
                          item.typeId
                        );
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => {
                        if (!layout || !canEditLayout) return;
                        placeFromLibrary(
                          item.typeId,
                          layout.canvasWidth / 2 - item.defaultW / 2,
                          layout.canvasHeight / 2 - item.defaultH / 2
                        );
                      }}
                      className="panel-inset flex flex-col items-start gap-1 px-2.5 py-2 text-left transition hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-45"
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

            {sideTab === 'comments' && layout && (
              <div className="space-y-3">
                <p className="text-[11px] text-ink-dim">
                  Feedback on <strong className="text-ink-muted">{layout.ownerName}</strong>
                  ’s “{layout.name}” — any role can comment.
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
                <form
                  onSubmit={(e) => void submitComment(e)}
                  className="space-y-2 border-t border-surface-600 pt-3"
                >
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
                    placeholder={user ? 'Comment on this version…' : 'Sign in to comment'}
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

        <div className="panel flex min-h-[min(70vh,720px)] flex-col overflow-hidden lg:min-h-[min(78vh,900px)]">
          {!layout ? (
            <div className="empty-state flex flex-1 flex-col items-center justify-center gap-3 py-16">
              {loading ? (
                'Loading floor plans…'
              ) : (
                <>
                  <p>No version selected.</p>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => {
                        setLayoutForm({ name: 'Initial Concept', description: '' });
                        setModal('new');
                      }}
                    >
                      Create your personal version
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <FloorPlanCanvas
              layout={layout}
              canEdit={canEditLayout}
              tool={tool}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onItemsChange={setItems}
              onDrawingsChange={setDrawings}
              onPlaceFromLibrary={placeFromLibrary}
              onAddDrawing={addDrawing}
              onDeleteSelected={deleteSelected}
              stageRef={stageRef}
            />
          )}
        </div>
      </div>

      <Modal
        open={modal === 'new' || modal === 'rename'}
        title={modal === 'new' ? 'New personal version' : 'Rename version'}
        onClose={() => setModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (modal === 'new') void handleCreate();
            else void handleRename();
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">Layout name</label>
            <input
              className="input"
              required
              placeholder='e.g. Concept A, Final Layout'
              value={layoutForm.name}
              onChange={(e) => setLayoutForm({ ...layoutForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[4rem]"
              placeholder="Notes for collaborators…"
              value={layoutForm.description}
              onChange={(e) =>
                setLayoutForm({ ...layoutForm, description: e.target.value })
              }
            />
          </div>
          {modal === 'new' && (
            <p className="text-[11px] text-ink-dim">
              This version is owned by you ({displayName}). Other users can view and comment,
              or copy it into their own workspace — they cannot overwrite yours.
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            {modal === 'new' ? 'Create personal version' : 'Save'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
