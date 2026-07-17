/**
 * Architectural detection orchestrator.
 *
 * Primary: OpenAI Vision via server /api/floorplans/detect (OPENAI_API_KEY).
 * Fallback: client-side computer vision when OpenAI is unavailable or fails.
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
  method: 'openai-vision' | 'cv' | 'openai+cv';
  message?: string;
  /** Human-readable error from OpenAI when falling back */
  openaiError?: string;
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

type OpenAiDetectResult =
  | { ok: true; data: DetectedArchitecture }
  | { ok: false; error: string; useLocal: boolean };

async function detectWithOpenAiVision(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number,
  onProgress?: (msg: string) => void
): Promise<OpenAiDetectResult> {
  try {
    onProgress?.('Encoding drawing for OpenAI Vision…');
    const { base64, mimeType } = await imageFileToAnalysisBase64(file, 1600);

    onProgress?.('OpenAI Vision is analyzing walls, doors, and windows…');
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
      method?: string;
      model?: string;
      walls?: RawDetection['walls'];
      doors?: RawDetection['doors'];
      windows?: RawDetection['windows'];
    };

    if (!res.ok || data.useLocal) {
      return {
        ok: false,
        error: data.error || `OpenAI Vision unavailable (${res.status})`,
        useLocal: true
      };
    }

    const mapped = toCanvasDrawings(data, canvasWidth, canvasHeight, wallThickness);
    if (!mapped.walls.length && !mapped.doors.length && !mapped.windows.length) {
      return {
        ok: false,
        error: 'OpenAI Vision returned no walls, doors, or windows.',
        useLocal: true
      };
    }

    return {
      ok: true,
      data: {
        ...mapped,
        method: 'openai-vision',
        message: `OpenAI Vision (${data.model || 'gpt-4o'}) detected ${mapped.walls.length} walls, ${mapped.doors.length} doors, ${mapped.windows.length} windows`
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OpenAI Vision request failed',
      useLocal: true
    };
  }
}

function outerFrame(
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number
): DetectedArchitecture {
  const t = Math.max(8, wallThickness || 10);
  const m = 40;
  return {
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

/**
 * Primary entry: OpenAI Vision first, CV fallback on failure.
 * Always returns placeable auto elements.
 */
export async function detectArchitecture(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness: number,
  onProgress?: (msg: string) => void
): Promise<DetectedArchitecture> {
  // 1) Primary: OpenAI Vision (server-side OPENAI_API_KEY)
  const openai = await detectWithOpenAiVision(
    file,
    canvasWidth,
    canvasHeight,
    wallThickness,
    onProgress
  );

  if (openai.ok) {
    onProgress?.(
      `Placing ${openai.data.walls.length} walls, ${openai.data.doors.length} doors, ${openai.data.windows.length} windows…`
    );
    return openai.data;
  }

  // 2) Graceful fallback: local computer vision
  onProgress?.(
    openai.error
      ? `OpenAI unavailable (${openai.error}). Running local edge detection…`
      : 'OpenAI unavailable — running local edge detection…'
  );

  try {
    const cv = await detectArchitectureCv(
      file,
      canvasWidth,
      canvasHeight,
      wallThickness,
      onProgress
    );
    const n = cv.walls.length + cv.doors.length + cv.windows.length;
    if (n > 0) {
      onProgress?.(
        `Placing ${cv.walls.length} walls, ${cv.doors.length} doors, ${cv.windows.length} windows…`
      );
      return {
        walls: cv.walls,
        doors: cv.doors,
        windows: cv.windows,
        method: 'cv',
        message: `${cv.message} (OpenAI fallback: ${openai.error})`,
        openaiError: openai.error
      };
    }
  } catch (err) {
    console.warn('[floorplan-detect] CV fallback failed', err);
  }

  const frame = outerFrame(canvasWidth, canvasHeight, wallThickness);
  frame.openaiError = openai.error;
  frame.message = `OpenAI Vision failed (${openai.error}). Placed structure frame for editing.`;
  onProgress?.('Placing structure frame…');
  return frame;
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
