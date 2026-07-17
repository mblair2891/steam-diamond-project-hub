/**
 * Client-only helpers: convert building drawings (PDF/image) into a canvas-ready PNG.
 * Never import this module from a server component.
 */

export type RasterizedDrawing = {
  file: File;
  width: number;
  height: number;
  sourceKind: 'image' | 'pdf';
};

const MAX_CANVAS_EDGE = 2200;

/** Fit drawing into canvas bounds while preserving aspect ratio. */
export function fitCanvasSize(width: number, height: number): {
  canvasWidth: number;
  canvasHeight: number;
} {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(w, h));
  return {
    canvasWidth: Math.max(400, Math.round(w * scale)),
    canvasHeight: Math.max(300, Math.round(h * scale))
  };
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|svg|heic|avif)$/i.test(file.name)
  );
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'floor-plan';
}

/**
 * Rasterize first page of a PDF to a high-res PNG File (pdf.js, browser only).
 */
export async function rasterizePdfToPng(
  source: File | ArrayBuffer,
  originalName = 'drawing.pdf',
  onProgress?: (message: string) => void
): Promise<RasterizedDrawing> {
  onProgress?.('Loading PDF engine…');
  const pdfjs = await import('pdfjs-dist');

  // Worker from CDN matching package version (avoids bundler worker issues in Next)
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data =
    source instanceof ArrayBuffer
      ? source
      : await source.arrayBuffer();

  onProgress?.('Rendering first page…');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages < 1) {
    throw new Error('This PDF has no pages.');
  }

  const page = await pdf.getPage(1);
  // High-DPI render for crisp zoom on the canvas
  const base = page.getViewport({ scale: 1 });
  const targetScale = Math.min(3, MAX_CANVAS_EDGE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: Math.max(1.5, targetScale) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas for PDF render.');

  // White background (many plans are black linework on transparent)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // pdf.js API differs slightly across minor versions
  const renderTask = page.render({
    canvasContext: ctx,
    viewport
  } as Parameters<typeof page.render>[0]);
  await renderTask.promise;

  onProgress?.('Encoding PNG…');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG from PDF.'))),
      'image/png',
      0.95
    );
  });

  const file = new File([blob], `${baseName(originalName)}.png`, {
    type: 'image/png'
  });

  return {
    file,
    width: canvas.width,
    height: canvas.height,
    sourceKind: 'pdf'
  };
}

/**
 * Read natural dimensions of an image File.
 */
export async function measureImageFile(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error('Could not read image dimensions.'));
      img.src = url;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare any supported building drawing for canvas background.
 * PDFs → first page PNG; images → original file + measured size.
 */
export async function prepareDrawingForCanvas(
  file: File,
  onProgress?: (message: string) => void
): Promise<RasterizedDrawing> {
  if (isPdfFile(file)) {
    return rasterizePdfToPng(file, file.name, onProgress);
  }
  if (!isImageFile(file)) {
    throw new Error('Upload a PDF or image (PNG, JPG, WebP, SVG).');
  }
  onProgress?.('Reading image…');
  const { width, height } = await measureImageFile(file);
  if (!width || !height) {
    throw new Error('Image has invalid dimensions.');
  }
  return { file, width, height, sourceKind: 'image' };
}

/**
 * Rasterize a PDF from a fetchable URL (signed/stream) — recovers legacy PDF-only layouts.
 */
export async function rasterizePdfUrlToPng(
  url: string,
  originalName = 'drawing.pdf',
  onProgress?: (message: string) => void
): Promise<RasterizedDrawing> {
  onProgress?.('Downloading PDF…');
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not download PDF (${res.status}).`);
  }
  const buffer = await res.arrayBuffer();
  return rasterizePdfToPng(buffer, originalName, onProgress);
}
