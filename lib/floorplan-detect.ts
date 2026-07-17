/**
 * Architectural detection orchestrator.
 *
 * Always runs computer-vision first (guaranteed useful walls).
 * Optionally merges AI vision results when XAI_API_KEY is configured.
 */

import { uid } from '@/lib/dates';
import { detectArchitectureCv } from '@/lib/floorplan-cv';
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
  method: 'cv' | 'ai' | 'cv+ai';
  message?: string;
};

/** Shrink image for vision API (max edge, JPEG). */
export async function imageFileToAnalysisBase64(
  file: File,
  maxEdge = 1400
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load image for analysis.'));
      el.src = url;
    });
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
        ? Math.max(4, Math.min(40, w.thickness > 2 ? w.thickness : w.thickness * 20))
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
      d.width != null ? (d.width > 2 ? d.width : d.width * canvasWidth) : 48
    );
    const height = Math.max(
      8,
      d.height != null ? (d.height > 2 ? d.height : d.height * canvasHeight) : 12
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
      w.width != null ? (w.width > 2 ? w.width : w.width * canvasWidth) : 56
    );
    const height = Math.max(
      6,
      w.height != null ? (w.height > 2 ? w.height : w.height * canvasHeight) : 14
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

async function detectWithAi(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number
): Promise<DetectedArchitecture | null> {
  try {
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

    if (!res.ok || data.useLocal) return null;

    const mapped = toCanvasDrawings(data, canvasWidth, canvasHeight, wallThickness);
    if (!mapped.walls.length && !mapped.doors.length && !mapped.windows.length) {
      return null;
    }
    return {
      ...mapped,
      method: 'ai',
      message: `AI detected ${mapped.walls.length} walls, ${mapped.doors.length} doors, ${mapped.windows.length} windows`
    };
  } catch {
    return null;
  }
}

function mergeDetections(
  primary: DetectedArchitecture,
  secondary: DetectedArchitecture | null
): DetectedArchitecture {
  if (!secondary) return primary;

  // Keep CV walls; add AI walls that don't heavily overlap existing
  const walls = [...primary.walls];
  for (const aw of secondary.walls) {
    const midX = (aw.x1 + aw.x2) / 2;
    const midY = (aw.y1 + aw.y2) / 2;
    const overlaps = walls.some((cw) => {
      const cmx = (cw.x1 + cw.x2) / 2;
      const cmy = (cw.y1 + cw.y2) / 2;
      return Math.hypot(cmx - midX, cmy - midY) < 40;
    });
    if (!overlaps) walls.push({ ...aw, id: uid('fpd') });
  }

  const doors = [...primary.doors];
  for (const d of secondary.doors) {
    if (!doors.some((x) => Math.hypot(x.x - d.x, x.y - d.y) < 35)) {
      doors.push({ ...d, id: uid('fpd') });
    }
  }

  const windows = [...primary.windows];
  for (const w of secondary.windows) {
    if (!windows.some((x) => Math.hypot(x.x - w.x, x.y - w.y) < 35)) {
      windows.push({ ...w, id: uid('fpd') });
    }
  }

  // Reindex z
  let z = 1;
  const reZ = <T extends { zIndex: number }>(arr: T[]) =>
    arr.map((item) => ({ ...item, zIndex: z++ }));

  return {
    walls: reZ(walls.slice(0, 120)),
    doors: reZ(doors.slice(0, 40)),
    windows: reZ(windows.slice(0, 40)),
    method: 'cv+ai',
    message: `Detected ${walls.length} walls, ${doors.length} doors, ${windows.length} windows (CV + AI)`
  };
}

/**
 * Required entry point: always produces auto walls/doors/windows.
 * CV is mandatory; AI is optional enhancement.
 */
export async function detectArchitecture(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number,
  onProgress?: (msg: string) => void
): Promise<DetectedArchitecture> {
  onProgress?.('Running computer vision (edges → walls)…');

  // 1) Always run CV — this is the guaranteed path
  const cv = await detectArchitectureCv(
    file,
    canvasWidth,
    canvasHeight,
    wallThickness,
    onProgress
  );

  let result: DetectedArchitecture = {
    walls: cv.walls,
    doors: cv.doors,
    windows: cv.windows,
    method: 'cv',
    message: cv.message
  };

  // 2) Optionally enrich with AI (non-blocking for empty API key)
  onProgress?.('Checking AI vision enhancement…');
  const ai = await detectWithAi(file, canvasWidth, canvasHeight, wallThickness);
  if (ai) {
    onProgress?.('Merging AI detections…');
    result = mergeDetections(result, ai);
  }

  const n = result.walls.length + result.doors.length + result.windows.length;
  if (n === 0) {
    // Should never happen (CV guarantees frame) — last-ditch outer frame
    const t = Math.max(8, wallThickness || 10);
    const m = 40;
    result = {
      walls: [
        {
          id: uid('fpd'),
          kind: 'wall',
          x1: m,
          y1: m,
          x2: canvasWidth - m,
          y2: m,
          thickness: t,
          color: AUTO_WALL_COLOR,
          zIndex: 1,
          source: 'auto'
        },
        {
          id: uid('fpd'),
          kind: 'wall',
          x1: canvasWidth - m,
          y1: m,
          x2: canvasWidth - m,
          y2: canvasHeight - m,
          thickness: t,
          color: AUTO_WALL_COLOR,
          zIndex: 2,
          source: 'auto'
        },
        {
          id: uid('fpd'),
          kind: 'wall',
          x1: canvasWidth - m,
          y1: canvasHeight - m,
          x2: m,
          y2: canvasHeight - m,
          thickness: t,
          color: AUTO_WALL_COLOR,
          zIndex: 3,
          source: 'auto'
        },
        {
          id: uid('fpd'),
          kind: 'wall',
          x1: m,
          y1: canvasHeight - m,
          x2: m,
          y2: m,
          thickness: t,
          color: AUTO_WALL_COLOR,
          zIndex: 4,
          source: 'auto'
        }
      ],
      doors: [],
      windows: [],
      method: 'cv',
      message: 'Placed outer structure frame for editing'
    };
  }

  onProgress?.(
    `Placing ${result.walls.length} walls, ${result.doors.length} doors, ${result.windows.length} windows…`
  );
  return result;
}

export function mergeAutoDrawings(
  existing: FloorPlanDrawing[],
  detected: DetectedArchitecture,
  replaceAuto = true
): FloorPlanDrawing[] {
  const keep = replaceAuto
    ? existing.filter((d) => d.source !== 'auto')
    : [...existing];
  const maxZ = keep.reduce((m, d) => Math.max(m, d.zIndex), 0);
  let z = maxZ + 1;
  const autos: FloorPlanDrawing[] = [
    ...detected.walls,
    ...detected.doors,
    ...detected.windows
  ].map((d) => ({ ...d, id: d.id || uid('fpd'), zIndex: z++, source: 'auto' as const }));
  return [...keep, ...autos];
}
