import 'server-only';
import { get, put } from '@vercel/blob';
import type {
  FloorPlanComment,
  FloorPlanDrawing,
  FloorPlanLayout,
  FloorPlanPlacedItem
} from '@/lib/types';
import {
  DEFAULT_CANVAS_H,
  DEFAULT_CANVAS_W,
  DEFAULT_FLOOR_PLAN_BG,
  DEFAULT_GRID_SIZE
} from '@/lib/floorplan-catalog';

export const FLOORPLANS_STORE_PATH = 'floorplans/store.json';

export type FloorPlansStore = {
  version: 1;
  layouts: FloorPlanLayout[];
  updatedAt?: string;
};

export function emptyFloorPlansStore(): FloorPlansStore {
  return { version: 1, layouts: [] };
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not configured. Add it in Vercel env and redeploy.'
    );
  }
  return token;
}

function normalizeItem(item: FloorPlanPlacedItem): FloorPlanPlacedItem {
  return {
    id: item.id,
    typeId: item.typeId || 'table-4top',
    label: item.label || 'Item',
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width: Math.max(12, Number(item.width) || 48),
    height: Math.max(12, Number(item.height) || 48),
    rotation: Number(item.rotation) || 0,
    zIndex: Number(item.zIndex) || 0
  };
}

function normalizeDrawing(d: FloorPlanDrawing): FloorPlanDrawing | null {
  if (!d || !d.id || !d.kind) return null;
  if (d.kind === 'wall') {
    return {
      id: d.id,
      kind: 'wall',
      x1: Number(d.x1) || 0,
      y1: Number(d.y1) || 0,
      x2: Number(d.x2) || 0,
      y2: Number(d.y2) || 0,
      thickness: Math.max(2, Number(d.thickness) || 8),
      color: d.color || '#e8b84a',
      zIndex: Number(d.zIndex) || 0
    };
  }
  if (d.kind === 'door' || d.kind === 'window') {
    return {
      id: d.id,
      kind: d.kind,
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      width: Math.max(12, Number(d.width) || 40),
      height: Math.max(8, Number(d.height) || 16),
      rotation: Number(d.rotation) || 0,
      color: d.color || (d.kind === 'door' ? '#6cb6ff' : '#3ecf8e'),
      zIndex: Number(d.zIndex) || 0
    };
  }
  if (d.kind === 'room-label') {
    return {
      id: d.id,
      kind: 'room-label',
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      text: d.text || 'Room',
      fontSize: Math.max(10, Number(d.fontSize) || 16),
      color: d.color || '#eef1f6',
      zIndex: Number(d.zIndex) || 0
    };
  }
  return null;
}

function normalizeComment(c: FloorPlanComment): FloorPlanComment {
  return {
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.authorId || '',
    authorName: c.authorName || 'User',
    body: c.body || '',
    createdAt: c.createdAt || new Date().toISOString(),
    pinX: c.pinX ?? null,
    pinY: c.pinY ?? null
  };
}

export function normalizeLayout(layout: FloorPlanLayout): FloorPlanLayout {
  const drawings = Array.isArray(layout.drawings)
    ? (layout.drawings.map(normalizeDrawing).filter(Boolean) as FloorPlanDrawing[])
    : [];
  return {
    id: layout.id,
    name: (layout.name || 'Untitled layout').trim() || 'Untitled layout',
    description: layout.description || '',
    ownerId: layout.ownerId || '',
    ownerName: layout.ownerName || 'User',
    backgroundUrl: layout.backgroundUrl ?? DEFAULT_FLOOR_PLAN_BG,
    backgroundPathname: layout.backgroundPathname ?? null,
    backgroundName: layout.backgroundName ?? null,
    backgroundMime: layout.backgroundMime ?? null,
    sourcePdfUrl: layout.sourcePdfUrl ?? null,
    sourcePdfPathname: layout.sourcePdfPathname ?? null,
    sourcePdfName: layout.sourcePdfName ?? null,
    drawingReady: Boolean(layout.drawingReady),
    canvasWidth: layout.canvasWidth || DEFAULT_CANVAS_W,
    canvasHeight: layout.canvasHeight || DEFAULT_CANVAS_H,
    gridSize: layout.gridSize || DEFAULT_GRID_SIZE,
    snapToGrid: Boolean(layout.snapToGrid),
    wallThickness: Math.max(2, Number(layout.wallThickness) || 10),
    wallColor: layout.wallColor || '#e8b84a',
    items: Array.isArray(layout.items) ? layout.items.map(normalizeItem) : [],
    drawings,
    comments: Array.isArray(layout.comments)
      ? layout.comments.map(normalizeComment)
      : [],
    createdAt: layout.createdAt || new Date().toISOString(),
    updatedAt: layout.updatedAt || layout.createdAt || new Date().toISOString(),
    updatedByName: layout.updatedByName ?? null,
    copiedFromId: layout.copiedFromId ?? null,
    copiedFromOwnerName: layout.copiedFromOwnerName ?? null
  };
}

export async function loadFloorPlansStore(token?: string): Promise<FloorPlansStore> {
  const t = token || requireToken();
  try {
    const result = await get(FLOORPLANS_STORE_PATH, {
      access: 'private',
      token: t,
      useCache: false
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return emptyFloorPlansStore();
    }
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as FloorPlansStore;
    if (!parsed || typeof parsed !== 'object') return emptyFloorPlansStore();
    const layouts = Array.isArray(parsed.layouts)
      ? parsed.layouts.map(normalizeLayout)
      : [];
    return { version: 1, layouts, updatedAt: parsed.updatedAt };
  } catch {
    return emptyFloorPlansStore();
  }
}

export async function saveFloorPlansStore(
  store: FloorPlansStore,
  token?: string
): Promise<FloorPlansStore> {
  const t = token || requireToken();
  const body: FloorPlansStore = {
    version: 1,
    layouts: store.layouts.map(normalizeLayout),
    updatedAt: new Date().toISOString()
  };
  await put(FLOORPLANS_STORE_PATH, JSON.stringify(body, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: t,
    cacheControlMaxAge: 60
  });
  return body;
}

export async function listFloorPlans(token?: string): Promise<{
  layouts: FloorPlanLayout[];
  updatedAt?: string;
  total: number;
}> {
  const store = await loadFloorPlansStore(token);
  const layouts = [...store.layouts].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  return { layouts, updatedAt: store.updatedAt, total: layouts.length };
}

export async function getFloorPlan(
  id: string,
  token?: string
): Promise<FloorPlanLayout | null> {
  const store = await loadFloorPlansStore(token);
  return store.layouts.find((l) => l.id === id) || null;
}

export async function upsertFloorPlan(
  layout: FloorPlanLayout,
  token?: string
): Promise<FloorPlanLayout> {
  const t = token || requireToken();
  const store = await loadFloorPlansStore(t);
  const next = normalizeLayout({
    ...layout,
    updatedAt: new Date().toISOString()
  });
  const idx = store.layouts.findIndex((l) => l.id === next.id);
  if (idx >= 0) {
    const prev = store.layouts[idx];
    // Never lose comments if client omits them
    if (!Array.isArray(layout.comments)) {
      next.comments = prev.comments;
    }
    store.layouts[idx] = next;
  } else {
    store.layouts.push(next);
  }
  await saveFloorPlansStore(store, t);
  return next;
}

export async function deleteFloorPlan(
  id: string,
  token?: string
): Promise<{ ok: boolean; layout?: FloorPlanLayout }> {
  const t = token || requireToken();
  const store = await loadFloorPlansStore(t);
  const idx = store.layouts.findIndex((l) => l.id === id);
  if (idx < 0) return { ok: false };
  const [removed] = store.layouts.splice(idx, 1);
  await saveFloorPlansStore(store, t);
  return { ok: true, layout: removed };
}

export async function appendFloorPlanComment(
  id: string,
  comment: FloorPlanComment,
  token?: string
): Promise<FloorPlanLayout | null> {
  const t = token || requireToken();
  const store = await loadFloorPlansStore(t);
  const idx = store.layouts.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const prev = store.layouts[idx];
  const next = normalizeLayout({
    ...prev,
    comments: [...(prev.comments || []), normalizeComment(comment)],
    updatedAt: new Date().toISOString()
  });
  store.layouts[idx] = next;
  await saveFloorPlansStore(store, t);
  return next;
}

export function newLayoutId(): string {
  return `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
