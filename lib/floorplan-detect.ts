/**
 * Client-side architectural detection helpers.
 * - Calls server AI vision when XAI_API_KEY is configured
 * - Falls back to local H/V line heuristics when AI is unavailable
 */

import { uid } from '@/lib/dates';
import type {
  FloorPlanDoor,
  FloorPlanDrawing,
  FloorPlanWall,
  FloorPlanWindow
} from '@/lib/types';
import {
  AUTO_DOOR_COLOR,
  AUTO_WALL_COLOR,
  AUTO_WINDOW_COLOR
} from '@/lib/types';

export type DetectedArchitecture = {
  walls: FloorPlanWall[];
  doors: FloorPlanDoor[];
  windows: FloorPlanWindow[];
  method: 'ai' | 'local';
  message?: string;
};

/** Shrink image for vision API (max edge, JPEG). */
export async function imageFileToAnalysisBase64(
  file: File,
  maxEdge = 1400
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create analysis canvas.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const mimeType = 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.85);
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) throw new Error('Failed to encode image for analysis.');
    return { base64, mimeType, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for analysis.'));
    img.src = src;
  });
}

type RawDetection = {
  walls?: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
  }>;
  doors?: Array<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    rotation?: number;
  }>;
  windows?: Array<{
    x: number;
    y: number;
    width?: number;
    height?: number;
    rotation?: number;
  }>;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  // Accept 0–1 or 0–1000 style coords
  if (n > 1.5) return Math.min(1, Math.max(0, n / 1000));
  return Math.min(1, Math.max(0, n));
}

function toCanvasDrawings(
  raw: RawDetection,
  canvasWidth: number,
  canvasHeight: number,
  wallThicknessDefault: number
): Omit<DetectedArchitecture, 'method' | 'message'> {
  const walls: FloorPlanWall[] = [];
  const doors: FloorPlanDoor[] = [];
  const windows: FloorPlanWindow[] = [];
  let z = 1;

  for (const w of raw.walls || []) {
    const x1 = clamp01(w.x1) * canvasWidth;
    const y1 = clamp01(w.y1) * canvasHeight;
    const x2 = clamp01(w.x2) * canvasWidth;
    const y2 = clamp01(w.y2) * canvasHeight;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 12) continue;
    const th =
      w.thickness != null
        ? Math.max(4, Math.min(40, (w.thickness > 2 ? w.thickness : w.thickness * 20)))
        : wallThicknessDefault;
    walls.push({
      id: uid('fpd'),
      kind: 'wall',
      x1,
      y1,
      x2,
      y2,
      thickness: th || 10,
      color: AUTO_WALL_COLOR,
      zIndex: z++,
      source: 'auto'
    });
  }

  for (const d of raw.doors || []) {
    const x = clamp01(d.x) * canvasWidth;
    const y = clamp01(d.y) * canvasHeight;
    const width = Math.max(
      24,
      (d.width != null ? (d.width > 2 ? d.width : d.width * canvasWidth) : 48)
    );
    const height = Math.max(
      8,
      (d.height != null ? (d.height > 2 ? d.height : d.height * canvasHeight) : 12)
    );
    doors.push({
      id: uid('fpd'),
      kind: 'door',
      x,
      y,
      width,
      height,
      rotation: Number(d.rotation) || 0,
      color: AUTO_DOOR_COLOR,
      zIndex: z++,
      source: 'auto'
    });
  }

  for (const w of raw.windows || []) {
    const x = clamp01(w.x) * canvasWidth;
    const y = clamp01(w.y) * canvasHeight;
    const width = Math.max(
      20,
      (w.width != null ? (w.width > 2 ? w.width : w.width * canvasWidth) : 56)
    );
    const height = Math.max(
      6,
      (w.height != null ? (w.height > 2 ? w.height : w.height * canvasHeight) : 14)
    );
    windows.push({
      id: uid('fpd'),
      kind: 'window',
      x,
      y,
      width,
      height,
      rotation: Number(w.rotation) || 0,
      color: AUTO_WINDOW_COLOR,
      zIndex: z++,
      source: 'auto'
    });
  }

  return { walls, doors, windows };
}

/**
 * Call server AI vision detection.
 */
export async function detectWithAi(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number
): Promise<DetectedArchitecture | null> {
  const { base64, mimeType } = await imageFileToAnalysisBase64(file);
  const res = await fetch('/api/floorplans/detect', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
      canvasWidth,
      canvasHeight
    })
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    useLocal?: boolean;
    error?: string;
    walls?: RawDetection['walls'];
    doors?: RawDetection['doors'];
    windows?: RawDetection['windows'];
  };

  if (res.status === 503 || data.useLocal) {
    return null; // signal local fallback
  }
  if (!res.ok) {
    throw new Error(data.error || `AI detection failed (${res.status})`);
  }

  const mapped = toCanvasDrawings(data, canvasWidth, canvasHeight, wallThickness);
  return {
    ...mapped,
    method: 'ai',
    message: `AI detected ${mapped.walls.length} walls, ${mapped.doors.length} doors, ${mapped.windows.length} windows`
  };
}

/**
 * Local H/V wall + opening heuristic (no API key required).
 * Detects long dark line runs as walls; short gaps as doors/windows.
 */
export async function detectLocalHeuristic(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number
): Promise<DetectedArchitecture> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sampleW = 320;
    const sampleH = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * sampleW));
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for local detection.');
    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

    const dark = new Uint8Array(sampleW * sampleH);
    for (let i = 0; i < dark.length; i++) {
      const o = i * 4;
      const g = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      dark[i] = g < 140 ? 1 : 0;
    }

    type Seg = { a: number; b: number; fixed: number; orient: 'h' | 'v' };
    const segs: Seg[] = [];

    // Horizontal runs
    for (let y = 2; y < sampleH - 2; y += 2) {
      let run = 0;
      let start = 0;
      for (let x = 0; x < sampleW; x++) {
        const on = dark[y * sampleW + x];
        if (on) {
          if (run === 0) start = x;
          run++;
        } else if (run >= 18) {
          segs.push({ a: start, b: x - 1, fixed: y, orient: 'h' });
          run = 0;
        } else {
          run = 0;
        }
      }
      if (run >= 18) segs.push({ a: start, b: sampleW - 1, fixed: y, orient: 'h' });
    }

    // Vertical runs
    for (let x = 2; x < sampleW - 2; x += 2) {
      let run = 0;
      let start = 0;
      for (let y = 0; y < sampleH; y++) {
        const on = dark[y * sampleW + x];
        if (on) {
          if (run === 0) start = y;
          run++;
        } else if (run >= 18) {
          segs.push({ a: start, b: y - 1, fixed: x, orient: 'v' });
          run = 0;
        } else {
          run = 0;
        }
      }
      if (run >= 18) segs.push({ a: start, b: sampleH - 1, fixed: x, orient: 'v' });
    }

    // Merge nearby parallel segments
    const merged = mergeSegments(segs, 4);

    const sx = canvasWidth / sampleW;
    const sy = canvasHeight / sampleH;
    const walls: FloorPlanWall[] = [];
    const doors: FloorPlanDoor[] = [];
    const windows: FloorPlanWindow[] = [];
    let z = 1;

    for (const s of merged) {
      if (s.orient === 'h') {
        const x1 = s.a * sx;
        const x2 = s.b * sx;
        const y = s.fixed * sy;
        walls.push({
          id: uid('fpd'),
          kind: 'wall',
          x1,
          y1: y,
          x2,
          y2: y,
          thickness: wallThickness || 10,
          color: AUTO_WALL_COLOR,
          zIndex: z++,
          source: 'auto'
        });
        // Gaps along the same row → possible openings
        for (const other of merged) {
          if (other === s || other.orient !== 'h') continue;
          if (Math.abs(other.fixed - s.fixed) > 3) continue;
          if (other.a > s.b + 4 && other.a - s.b < 40) {
            const gap = (other.a - s.b) * sx;
            const mid = ((s.b + other.a) / 2) * sx;
            if (gap > 20 && gap < 90) {
              doors.push({
                id: uid('fpd'),
                kind: 'door',
                x: mid - gap / 2,
                y: y - 6,
                width: gap,
                height: 12,
                rotation: 0,
                color: AUTO_DOOR_COLOR,
                zIndex: z++,
                source: 'auto'
              });
            } else if (gap >= 90 && gap < 160) {
              windows.push({
                id: uid('fpd'),
                kind: 'window',
                x: mid - gap / 2,
                y: y - 7,
                width: Math.min(gap, 100),
                height: 14,
                rotation: 0,
                color: AUTO_WINDOW_COLOR,
                zIndex: z++,
                source: 'auto'
              });
            }
          }
        }
      } else {
        const y1 = s.a * sy;
        const y2 = s.b * sy;
        const x = s.fixed * sx;
        walls.push({
          id: uid('fpd'),
          kind: 'wall',
          x1: x,
          y1,
          x2: x,
          y2,
          thickness: wallThickness || 10,
          color: AUTO_WALL_COLOR,
          zIndex: z++,
          source: 'auto'
        });
      }
    }

    // Cap counts for usability
    const outWalls = walls.slice(0, 80);
    const outDoors = doors.slice(0, 25);
    const outWindows = windows.slice(0, 25);

    return {
      walls: outWalls,
      doors: outDoors,
      windows: outWindows,
      method: 'local',
      message: `Detected ${outWalls.length} walls, ${outDoors.length} doors, ${outWindows.length} windows (local analysis)`
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mergeSegments(segs: Array<{ a: number; b: number; fixed: number; orient: 'h' | 'v' }>, tol: number) {
  const byKey = new Map<string, typeof segs>();
  for (const s of segs) {
    const key = `${s.orient}:${Math.round(s.fixed / tol) * tol}`;
    const list = byKey.get(key) || [];
    list.push(s);
    byKey.set(key, list);
  }
  const out: typeof segs = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.a - b.a);
    let cur = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const n = list[i];
      if (n.a <= cur.b + tol * 2) {
        cur.b = Math.max(cur.b, n.b);
        cur.fixed = Math.round((cur.fixed + n.fixed) / 2);
      } else {
        out.push(cur);
        cur = { ...n };
      }
    }
    out.push(cur);
  }
  return out.filter((s) => s.b - s.a >= 16);
}

export async function detectArchitecture(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number,
  onProgress?: (msg: string) => void
): Promise<DetectedArchitecture> {
  onProgress?.('Analyzing drawing for walls, doors, windows…');
  try {
    const ai = await detectWithAi(file, canvasWidth, canvasHeight, wallThickness);
    if (ai && (ai.walls.length || ai.doors.length || ai.windows.length)) {
      return ai;
    }
    if (ai && !ai.walls.length && !ai.doors.length && !ai.windows.length) {
      onProgress?.('AI found no clear elements — trying local analysis…');
    } else {
      onProgress?.('AI unavailable — using local wall detection…');
    }
  } catch (err) {
    console.warn('[floorplan-detect] AI failed, using local', err);
    onProgress?.('AI unavailable — using local wall detection…');
  }
  return detectLocalHeuristic(file, canvasWidth, canvasHeight, wallThickness);
}

export function mergeAutoDrawings(
  existing: FloorPlanDrawing[],
  detected: DetectedArchitecture,
  replaceAuto = true
): FloorPlanDrawing[] {
  const keep = replaceAuto
    ? existing.filter((d) => d.source !== 'auto')
    : existing;
  const maxZ = keep.reduce((m, d) => Math.max(m, d.zIndex), 0);
  let z = maxZ + 1;
  const autos: FloorPlanDrawing[] = [
    ...detected.walls,
    ...detected.doors,
    ...detected.windows
  ].map((d) => ({ ...d, zIndex: z++ }));
  return [...keep, ...autos];
}
