/**
 * Client-side computer vision for architectural floor plans.
 * Pipeline: grayscale → blur → adaptive threshold / edges → H/V line extraction
 * → merge → gap analysis for doors/windows.
 *
 * Always returns walls (at least a content bounding frame) so the user never
 * gets a blank "trace manually" result.
 */

import { uid } from '@/lib/dates';
import type { FloorPlanDoor, FloorPlanWall, FloorPlanWindow } from '@/lib/types';
import {
  AUTO_DOOR_COLOR,
  AUTO_WALL_COLOR,
  AUTO_WINDOW_COLOR
} from '@/lib/types';

export type CvDetectionResult = {
  walls: FloorPlanWall[];
  doors: FloorPlanDoor[];
  windows: FloorPlanWindow[];
  method: 'cv';
  message: string;
  debug?: { sampleW: number; sampleH: number; edgeCount: number; lineCount: number };
};

type LineSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orient: 'h' | 'v' | 'diag';
  strength: number;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image for CV analysis.'));
    };
    img.src = url;
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Box blur on grayscale Uint8ClampedArray */
function boxBlur(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  r = 1
): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);
  const diam = r * 2 + 1;

  // Horizontal
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      sum += src[y * w + clamp(x, 0, w - 1)];
    }
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / diam;
      const drop = src[y * w + clamp(x - r, 0, w - 1)];
      const add = src[y * w + clamp(x + r + 1, 0, w - 1)];
      sum += add - drop;
    }
  }
  // Vertical
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      sum += tmp[clamp(y, 0, h - 1) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / diam;
      const drop = tmp[clamp(y - r, 0, h - 1) * w + x];
      const add = tmp[clamp(y + r + 1, 0, h - 1) * w + x];
      sum += add - drop;
    }
  }
  return out;
}

/** Sobel magnitude 0–255 */
function sobelMagnitude(gray: Uint8ClampedArray, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] +
        gray[i - w + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + w - 1] +
        gray[i + w + 1];
      const gy =
        -gray[i - w - 1] -
        2 * gray[i - w] -
        gray[i - w + 1] +
        gray[i + w - 1] +
        2 * gray[i + w] +
        gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/** Adaptive binary edges: top percentile of gradient + dark-line mask */
function buildEdgeMap(
  gray: Uint8ClampedArray,
  mag: Float32Array,
  w: number,
  h: number
): Uint8Array {
  // Percentile threshold on magnitude
  const sample: number[] = [];
  for (let i = 0; i < mag.length; i += 7) {
    if (mag[i] > 0) sample.push(mag[i]);
  }
  sample.sort((a, b) => a - b);
  const p = sample[Math.floor(sample.length * 0.82)] || 40;
  const magThresh = Math.max(28, p);

  // Otsu-ish dark threshold (ink on paper)
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) {
      maxVar = v;
      thr = t;
    }
  }
  // Prefer dark ink: use slightly above Otsu
  const inkThr = Math.min(thr + 15, 180);

  const edges = new Uint8Array(w * h);
  for (let i = 0; i < edges.length; i++) {
    const isEdge = mag[i] >= magThresh;
    const isInk = gray[i] < inkThr;
    // Ink OR strong edge — captures thin black plan lines
    edges[i] = isEdge || isInk ? 1 : 0;
  }

  // Light morphology: dilate 1px so thin walls form continuous runs
  const dil = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        edges[i] ||
        edges[i - 1] ||
        edges[i + 1] ||
        edges[i - w] ||
        edges[i + w]
      ) {
        dil[i] = 1;
      }
    }
  }
  return dil;
}

/** Extract horizontal and vertical wall segments via run-length encoding on edge map */
function extractAxisSegments(
  edges: Uint8Array,
  w: number,
  h: number
): LineSeg[] {
  const segs: LineSeg[] = [];
  const minRun = Math.max(12, Math.floor(Math.min(w, h) * 0.04));

  // Horizontal: scan every row
  for (let y = 0; y < h; y++) {
    let run = 0;
    let start = 0;
    let strength = 0;
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x]) {
        if (run === 0) start = x;
        run++;
        strength += 1;
      } else if (run >= minRun) {
        segs.push({
          x1: start,
          y1: y,
          x2: x - 1,
          y2: y,
          orient: 'h',
          strength: strength / run
        });
        run = 0;
        strength = 0;
      } else {
        run = 0;
        strength = 0;
      }
    }
    if (run >= minRun) {
      segs.push({
        x1: start,
        y1: y,
        x2: w - 1,
        y2: y,
        orient: 'h',
        strength: strength / run
      });
    }
  }

  // Vertical: scan every column
  for (let x = 0; x < w; x++) {
    let run = 0;
    let start = 0;
    let strength = 0;
    for (let y = 0; y < h; y++) {
      if (edges[y * w + x]) {
        if (run === 0) start = y;
        run++;
        strength += 1;
      } else if (run >= minRun) {
        segs.push({
          x1: x,
          y1: start,
          x2: x,
          y2: y - 1,
          orient: 'v',
          strength: strength / run
        });
        run = 0;
        strength = 0;
      } else {
        run = 0;
        strength = 0;
      }
    }
    if (run >= minRun) {
      segs.push({
        x1: x,
        y1: start,
        x2: x,
        y2: h - 1,
        orient: 'v',
        strength: strength / run
      });
    }
  }

  return segs;
}

/** Merge collinear overlapping/near segments */
function mergeCollinear(segs: LineSeg[], tol: number): LineSeg[] {
  const h = segs.filter((s) => s.orient === 'h');
  const v = segs.filter((s) => s.orient === 'v');

  function mergeGroup(list: LineSeg[], axis: 'h' | 'v'): LineSeg[] {
    if (!list.length) return [];
    // Bucket by fixed coordinate
    const buckets = new Map<number, LineSeg[]>();
    for (const s of list) {
      const fixed = axis === 'h' ? s.y1 : s.x1;
      const key = Math.round(fixed / tol) * tol;
      const arr = buckets.get(key) || [];
      arr.push(s);
      buckets.set(key, arr);
    }
    const out: LineSeg[] = [];
    for (const [, group] of buckets) {
      if (axis === 'h') {
        group.sort((a, b) => a.x1 - b.x1);
        let cur = { ...group[0] };
        for (let i = 1; i < group.length; i++) {
          const n = group[i];
          if (n.x1 <= cur.x2 + tol * 3) {
            cur.x2 = Math.max(cur.x2, n.x2);
            cur.y1 = cur.y2 = Math.round((cur.y1 + n.y1) / 2);
            cur.strength = Math.max(cur.strength, n.strength);
          } else {
            out.push(cur);
            cur = { ...n };
          }
        }
        out.push(cur);
      } else {
        group.sort((a, b) => a.y1 - b.y1);
        let cur = { ...group[0] };
        for (let i = 1; i < group.length; i++) {
          const n = group[i];
          if (n.y1 <= cur.y2 + tol * 3) {
            cur.y2 = Math.max(cur.y2, n.y2);
            cur.x1 = cur.x2 = Math.round((cur.x1 + n.x1) / 2);
            cur.strength = Math.max(cur.strength, n.strength);
          } else {
            out.push(cur);
            cur = { ...n };
          }
        }
        out.push(cur);
      }
    }
    return out;
  }

  const minLen = tol * 3;
  return [
    ...mergeGroup(h, 'h').filter((s) => Math.abs(s.x2 - s.x1) >= minLen),
    ...mergeGroup(v, 'v').filter((s) => Math.abs(s.y2 - s.y1) >= minLen)
  ];
}

/** Suppress near-duplicate parallel walls */
function nmsParallel(segs: LineSeg[], distTol: number, overlapRatio = 0.5): LineSeg[] {
  const kept: LineSeg[] = [];
  const sorted = [...segs].sort((a, b) => {
    const la = a.orient === 'h' ? Math.abs(a.x2 - a.x1) : Math.abs(a.y2 - a.y1);
    const lb = b.orient === 'h' ? Math.abs(b.x2 - b.x1) : Math.abs(b.y2 - b.y1);
    return lb - la;
  });

  for (const s of sorted) {
    let suppress = false;
    for (const k of kept) {
      if (k.orient !== s.orient) continue;
      if (s.orient === 'h') {
        if (Math.abs(k.y1 - s.y1) > distTol) continue;
        const o0 = Math.max(k.x1, s.x1);
        const o1 = Math.min(k.x2, s.x2);
        const overlap = Math.max(0, o1 - o0);
        const shorter = Math.min(Math.abs(k.x2 - k.x1), Math.abs(s.x2 - s.x1));
        if (shorter > 0 && overlap / shorter >= overlapRatio) {
          suppress = true;
          break;
        }
      } else {
        if (Math.abs(k.x1 - s.x1) > distTol) continue;
        const o0 = Math.max(k.y1, s.y1);
        const o1 = Math.min(k.y2, s.y2);
        const overlap = Math.max(0, o1 - o0);
        const shorter = Math.min(Math.abs(k.y2 - k.y1), Math.abs(s.y2 - s.y1));
        if (shorter > 0 && overlap / shorter >= overlapRatio) {
          suppress = true;
          break;
        }
      }
    }
    if (!suppress) kept.push(s);
  }
  return kept;
}

/** Find gaps between collinear wall segments → doors / windows */
function openingsFromGaps(
  segs: LineSeg[],
  scaleX: number,
  scaleY: number,
  zStart: number
): { doors: FloorPlanDoor[]; windows: FloorPlanWindow[]; nextZ: number } {
  const doors: FloorPlanDoor[] = [];
  const windows: FloorPlanWindow[] = [];
  let z = zStart;

  const hSegs = segs
    .filter((s) => s.orient === 'h')
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vSegs = segs
    .filter((s) => s.orient === 'v')
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  // Horizontal gaps
  for (let i = 0; i < hSegs.length; i++) {
    for (let j = i + 1; j < hSegs.length; j++) {
      const a = hSegs[i];
      const b = hSegs[j];
      if (Math.abs(a.y1 - b.y1) > 4) break;
      const left = a.x2 < b.x1 ? a : b;
      const right = a.x2 < b.x1 ? b : a;
      if (left === right) continue;
      if (right.x1 <= left.x2) continue;
      const gapPx = right.x1 - left.x2;
      if (gapPx < 8 || gapPx > 90) continue;
      const gap = gapPx * scaleX;
      const mid = ((left.x2 + right.x1) / 2) * scaleX;
      const y = left.y1 * scaleY;
      if (gap >= 28 && gap < 100) {
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
      } else if (gap >= 100 && gap <= 180) {
        windows.push({
          id: uid('fpd'),
          kind: 'window',
          x: mid - Math.min(gap, 120) / 2,
          y: y - 7,
          width: Math.min(gap, 120),
          height: 14,
          rotation: 0,
          color: AUTO_WINDOW_COLOR,
          zIndex: z++,
          source: 'auto'
        });
      }
    }
  }

  // Vertical gaps
  for (let i = 0; i < vSegs.length; i++) {
    for (let j = i + 1; j < vSegs.length; j++) {
      const a = vSegs[i];
      const b = vSegs[j];
      if (Math.abs(a.x1 - b.x1) > 4) break;
      const top = a.y2 < b.y1 ? a : b;
      const bot = a.y2 < b.y1 ? b : a;
      if (top === bot) continue;
      if (bot.y1 <= top.y2) continue;
      const gapPx = bot.y1 - top.y2;
      if (gapPx < 8 || gapPx > 70) continue;
      const gap = gapPx * scaleY;
      const mid = ((top.y2 + bot.y1) / 2) * scaleY;
      const x = top.x1 * scaleX;
      if (gap >= 28 && gap < 100) {
        doors.push({
          id: uid('fpd'),
          kind: 'door',
          x: x - 6,
          y: mid - gap / 2,
          width: 12,
          height: gap,
          rotation: 90,
          color: AUTO_DOOR_COLOR,
          zIndex: z++,
          source: 'auto'
        });
      } else if (gap >= 100 && gap <= 160) {
        windows.push({
          id: uid('fpd'),
          kind: 'window',
          x: x - 7,
          y: mid - Math.min(gap, 100) / 2,
          width: 14,
          height: Math.min(gap, 100),
          rotation: 90,
          color: AUTO_WINDOW_COLOR,
          zIndex: z++,
          source: 'auto'
        });
      }
    }
  }

  // Dedup openings close together
  const dedup = <T extends { x: number; y: number }>(arr: T[], minDist: number) => {
    const out: T[] = [];
    for (const item of arr) {
      if (out.some((o) => Math.hypot(o.x - item.x, o.y - item.y) < minDist)) continue;
      out.push(item);
    }
    return out;
  };

  return {
    doors: dedup(doors, 30).slice(0, 30),
    windows: dedup(windows, 30).slice(0, 30),
    nextZ: z
  };
}

/** Bounding walls from content ink bbox — guarantees a useful starting frame */
function contentFrameWalls(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  canvasWidth: number,
  canvasHeight: number,
  thickness: number,
  zStart: number
): { walls: FloorPlanWall[]; nextZ: number } {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  // Use darker quartile as content
  let sum = 0;
  for (let i = 0; i < gray.length; i += 11) sum += gray[i];
  const mean = sum / Math.ceil(gray.length / 11);
  const thr = Math.min(mean - 10, 200);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < thr) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX - minX < w * 0.15 || maxY - minY < h * 0.15) {
    minX = Math.floor(w * 0.08);
    minY = Math.floor(h * 0.08);
    maxX = Math.floor(w * 0.92);
    maxY = Math.floor(h * 0.92);
  }

  const pad = 2;
  minX = clamp(minX - pad, 0, w - 1);
  minY = clamp(minY - pad, 0, h - 1);
  maxX = clamp(maxX + pad, 0, w - 1);
  maxY = clamp(maxY + pad, 0, h - 1);

  const sx = canvasWidth / w;
  const sy = canvasHeight / h;
  const x1 = minX * sx;
  const y1 = minY * sy;
  const x2 = maxX * sx;
  const y2 = maxY * sy;
  let z = zStart;
  const mk = (xa: number, ya: number, xb: number, yb: number): FloorPlanWall => ({
    id: uid('fpd'),
    kind: 'wall',
    x1: xa,
    y1: ya,
    x2: xb,
    y2: yb,
    thickness,
    color: AUTO_WALL_COLOR,
    zIndex: z++,
    source: 'auto'
  });

  return {
    walls: [
      mk(x1, y1, x2, y1),
      mk(x2, y1, x2, y2),
      mk(x2, y2, x1, y2),
      mk(x1, y2, x1, y1)
    ],
    nextZ: z
  };
}

/**
 * Run full CV detection on a raster File (PNG/JPEG).
 * Maps results into canvas coordinates (canvasWidth × canvasHeight).
 */
export async function detectArchitectureCv(
  file: File,
  canvasWidth: number,
  canvasHeight: number,
  wallThickness = 10,
  onProgress?: (msg: string) => void
): Promise<CvDetectionResult> {
  onProgress?.('Running edge detection…');
  const img = await loadImageFromFile(file);

  // Working resolution: balance accuracy vs speed
  const MAX = 720;
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX / Math.max(natW, natH));
  const w = Math.max(64, Math.round(natW * scale));
  const h = Math.max(64, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not available for detection.');

  // White fill then draw (handles transparent PNGs)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  onProgress?.('Blurring and finding edges…');
  const blurred = boxBlur(gray, w, h, 1);
  const mag = sobelMagnitude(blurred, w, h);
  const edges = buildEdgeMap(blurred, mag, w, h);

  let edgeCount = 0;
  for (let i = 0; i < edges.length; i++) edgeCount += edges[i];

  onProgress?.('Extracting wall lines…');
  let segs = extractAxisSegments(edges, w, h);
  segs = mergeCollinear(segs, 3);
  segs = nmsParallel(segs, 5, 0.55);

  // Keep strongest/longest walls
  segs.sort((a, b) => {
    const la = a.orient === 'h' ? Math.abs(a.x2 - a.x1) : Math.abs(a.y2 - a.y1);
    const lb = b.orient === 'h' ? Math.abs(b.x2 - b.x1) : Math.abs(b.y2 - b.y1);
    return lb - la;
  });
  segs = segs.slice(0, 120);

  const sx = canvasWidth / w;
  const sy = canvasHeight / h;
  const thickness = Math.max(6, wallThickness || 10);
  let z = 1;

  const walls: FloorPlanWall[] = segs.map((s) => ({
    id: uid('fpd'),
    kind: 'wall' as const,
    x1: s.x1 * sx,
    y1: s.y1 * sy,
    x2: s.x2 * sx,
    y2: s.y2 * sy,
    thickness,
    color: AUTO_WALL_COLOR,
    zIndex: z++,
    source: 'auto' as const
  }));

  onProgress?.('Detecting doors and windows…');
  const openings = openingsFromGaps(segs, sx, sy, z);
  let doors = openings.doors;
  let windows = openings.windows;
  z = openings.nextZ;

  // Guarantee useful starting geometry
  if (walls.length < 4) {
    onProgress?.('Building structure frame from drawing bounds…');
    const frame = contentFrameWalls(gray, w, h, canvasWidth, canvasHeight, thickness, z);
    // Prefer frame + any extra long segments
    const extra = walls.filter((wall) => {
      const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      return len > Math.min(canvasWidth, canvasHeight) * 0.2;
    });
    walls.length = 0;
    walls.push(...frame.walls, ...extra);
    z = frame.nextZ;
  }

  // Cap for UI performance
  const outWalls = walls.slice(0, 100);
  doors = doors.slice(0, 30);
  windows = windows.slice(0, 30);

  const total = outWalls.length + doors.length + windows.length;
  return {
    walls: outWalls,
    doors,
    windows,
    method: 'cv',
    message: `Detected ${outWalls.length} walls, ${doors.length} doors, ${windows.length} windows (computer vision)`,
    debug: { sampleW: w, sampleH: h, edgeCount, lineCount: segs.length }
  };
}
