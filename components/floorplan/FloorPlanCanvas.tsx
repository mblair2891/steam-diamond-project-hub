'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent
} from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import type Konva from 'konva';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { getCatalogItem } from '@/lib/floorplan-catalog';
import { uid } from '@/lib/dates';
import type {
  FloorPlanDoor,
  FloorPlanDrawing,
  FloorPlanPlacedItem,
  FloorPlanRoomLabel,
  FloorPlanWall,
  FloorPlanWindow
} from '@/lib/types';
import PlacedItemNode from './PlacedItemNode';
import { DoorNode, RoomLabelNode, WallNode, WindowNode } from './DrawingNodes';
import type { FloorPlanCanvasProps, FloorPlanStageHandle } from './types';

export type { FloorPlanCanvasProps, FloorPlanStageHandle };

function useHtmlImage(src?: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!src) {
      setImage(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const img = new window.Image();
    // Same-origin stream URLs don't need CORS; cross-origin signed CDN does
    const isSameOrigin =
      src.startsWith('/') ||
      (typeof window !== 'undefined' && src.startsWith(window.location.origin));
    if (!isSameOrigin) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
        setError(null);
        setLoading(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        // Retry with crossOrigin if first attempt failed (some CDNs)
        if (!img.crossOrigin) {
          const retry = new window.Image();
          retry.crossOrigin = 'anonymous';
          retry.onload = () => {
            if (!cancelled) {
              setImage(retry);
              setError(null);
              setLoading(false);
            }
          };
          retry.onerror = () => {
            if (!cancelled) {
              setImage(null);
              setError('Could not load floor plan background image.');
              setLoading(false);
            }
          };
          retry.src = src;
          return;
        }
        setImage(null);
        setError('Could not load floor plan background image.');
        setLoading(false);
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { image, error, loading };
}

function snap(value: number, grid: number, enabled: boolean) {
  if (!enabled || grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export default function FloorPlanCanvas({
  layout,
  canEdit,
  tool,
  selectedId,
  onSelect,
  onItemsChange,
  onDrawingsChange,
  onPlaceFromLibrary,
  onAddDrawing,
  onDeleteSelected,
  stageRef: externalStageRef
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [scale, setScale] = useState(0.55);
  const [stagePos, setStagePos] = useState({ x: 40, y: 20 });
  const [spacePan, setSpacePan] = useState(false);
  const [wallDraft, setWallDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );

  const bgRef = layout.backgroundPathname || layout.backgroundUrl || '';
  const isPublic = bgRef.startsWith('/') && !bgRef.startsWith('/api/');
  const isPdfBg =
    (layout.backgroundMime || '').includes('pdf') ||
    /\.pdf$/i.test(layout.backgroundName || '') ||
    /\.pdf(\?|$)/i.test(bgRef);

  // Prefer same-origin stream for private blobs (reliable cookies + canvas tint safety)
  const { url: signedBg, streamUrl, loading: bgSigning, error: bgSignError } = useSignedMediaUrl(
    isPublic || !bgRef || isPdfBg ? null : bgRef,
    { filename: layout.backgroundName || undefined }
  );
  const bgSrc = isPublic
    ? bgRef
    : isPdfBg
      ? null
      : streamUrl || signedBg || null;
  const { image: bgImage, error: bgLoadError, loading: bgImgLoading } = useHtmlImage(bgSrc);

  // Legacy PDF-only layouts: rasterize client-side so the drawing appears on canvas
  const [pdfFallbackImage, setPdfFallbackImage] = useState<HTMLImageElement | null>(null);
  const [pdfFallbackError, setPdfFallbackError] = useState<string | null>(null);
  const [pdfConverting, setPdfConverting] = useState(false);

  const {
    url: signedPdf,
    streamUrl: streamPdf,
    loading: pdfSigning
  } = useSignedMediaUrl(isPdfBg && bgRef ? bgRef : null, {
    filename: layout.backgroundName || undefined
  });

  useEffect(() => {
    if (!isPdfBg) {
      setPdfFallbackImage(null);
      setPdfFallbackError(null);
      setPdfConverting(false);
      return;
    }
    const pdfUrl = streamPdf || signedPdf;
    if (!pdfUrl) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfConverting(true);
    setPdfFallbackError(null);

    (async () => {
      try {
        const { rasterizePdfUrlToPng } = await import('@/lib/floorplan-background');
        const raster = await rasterizePdfUrlToPng(
          pdfUrl,
          layout.backgroundName || 'drawing.pdf'
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(raster.file);
        const img = new window.Image();
        img.onload = () => {
          if (!cancelled) {
            setPdfFallbackImage(img);
            setPdfConverting(false);
          }
        };
        img.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (!cancelled) {
            setPdfFallbackError('Could not display converted PDF page.');
            setPdfConverting(false);
          }
        };
        img.src = objectUrl;
      } catch (err) {
        if (!cancelled) {
          setPdfFallbackError(
            err instanceof Error ? err.message : 'PDF conversion failed'
          );
          setPdfConverting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isPdfBg, streamPdf, signedPdf, layout.backgroundName]);

  const displayImage = bgImage || pdfFallbackImage;
  const bgLoading = bgSigning || bgImgLoading || pdfSigning || pdfConverting;
  const bgError = bgSignError || bgLoadError || pdfFallbackError;

  const items = useMemo(
    () => [...(layout.items || [])].sort((a, b) => a.zIndex - b.zIndex),
    [layout.items]
  );
  const drawings = useMemo(
    () => [...(layout.drawings || [])].sort((a, b) => a.zIndex - b.zIndex),
    [layout.drawings]
  );

  const panMode = tool === 'pan' || spacePan;
  const drawMode =
    canEdit && (tool === 'wall' || tool === 'door' || tool === 'window' || tool === 'room-label');

  function removeById(id: string) {
    if (layout.items.some((i) => i.id === id)) {
      onItemsChange(layout.items.filter((i) => i.id !== id));
      onSelect(null);
      return;
    }
    if (layout.drawings.some((d) => d.id === id)) {
      onDrawingsChange(layout.drawings.filter((d) => d.id !== id));
      onSelect(null);
    }
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: Math.max(320, cr.width), h: Math.max(360, cr.height) });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 560 });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePan(true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit && selectedId) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        onDeleteSelected();
      }
      if (e.key === 'Escape') {
        setWallDraft(null);
        onSelect(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canEdit, selectedId, onDeleteSelected, onSelect]);

  const setStageNode = useCallback(
    (node: Konva.Stage | null) => {
      stageRef.current = node;
      if (externalStageRef) {
        externalStageRef.current = node as unknown as FloorPlanStageHandle | null;
      }
    },
    [externalStageRef]
  );

  const zoomBy = useCallback((factor: number, center?: { x: number; y: number }) => {
    setScale((prev) => {
      const next = Math.min(3.5, Math.max(0.15, prev * factor));
      if (center && stageRef.current) {
        const stage = stageRef.current;
        const oldScale = prev;
        const mousePointTo = {
          x: (center.x - stage.x()) / oldScale,
          y: (center.y - stage.y()) / oldScale
        };
        setStagePos({
          x: center.x - mousePointTo.x * next,
          y: center.y - mousePointTo.y * next
        });
      }
      return next;
    });
  }, []);

  const fitView = useCallback(() => {
    const pad = 24;
    const sx = (size.w - pad * 2) / layout.canvasWidth;
    const sy = (size.h - pad * 2) / layout.canvasHeight;
    const next = Math.min(sx, sy, 1.2);
    setScale(next);
    setStagePos({
      x: (size.w - layout.canvasWidth * next) / 2,
      y: (size.h - layout.canvasHeight * next) / 2
    });
  }, [size.w, size.h, layout.canvasWidth, layout.canvasHeight]);

  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.id, layout.canvasWidth, layout.canvasHeight, size.w, size.h]);

  function worldFromEvent(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage();
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY()
    };
  }

  function updateItem(id: string, patch: Partial<FloorPlanPlacedItem>) {
    onItemsChange(
      layout.items.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        if (layout.snapToGrid && (patch.x != null || patch.y != null)) {
          next.x = snap(next.x, layout.gridSize, true);
          next.y = snap(next.y, layout.gridSize, true);
        }
        return next;
      })
    );
  }

  function updateDrawing(id: string, patch: Partial<FloorPlanDrawing>) {
    onDrawingsChange(
      layout.drawings.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch } as FloorPlanDrawing;
        if (layout.snapToGrid) {
          if (next.kind === 'wall') {
            next.x1 = snap(next.x1, layout.gridSize, true);
            next.y1 = snap(next.y1, layout.gridSize, true);
            next.x2 = snap(next.x2, layout.gridSize, true);
            next.y2 = snap(next.y2, layout.gridSize, true);
          } else if (next.kind === 'door' || next.kind === 'window' || next.kind === 'room-label') {
            next.x = snap(next.x, layout.gridSize, true);
            next.y = snap(next.y, layout.gridSize, true);
          }
        }
        return next;
      })
    );
  }

  function handleDrop(e: ReactDragEvent) {
    e.preventDefault();
    if (!canEdit || !stageRef.current) return;
    const typeId = e.dataTransfer.getData('application/x-sdh-floorplan-type');
    if (!typeId) return;
    const stage = stageRef.current;
    stage.setPointersPositions(e);
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const x = (pointer.x - stage.x()) / stage.scaleX();
    const y = (pointer.y - stage.y()) / stage.scaleY();
    const catalog = getCatalogItem(typeId);
    onPlaceFromLibrary(
      typeId,
      snap(x - (catalog?.defaultW || 48) / 2, layout.gridSize, layout.snapToGrid),
      snap(y - (catalog?.defaultH || 48) / 2, layout.gridSize, layout.snapToGrid)
    );
  }

  function handleStagePointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (panMode) return;
    const isBg =
      e.target === e.target.getStage() ||
      e.target.getClassName() === 'Image' ||
      e.target.name() === 'canvas-bg';

    if (tool === 'delete' && canEdit) {
      // selection handled by nodes; empty click clears
      if (isBg) onSelect(null);
      return;
    }

    if (!drawMode || !isBg) {
      if (isBg && tool === 'select') onSelect(null);
      return;
    }

    const pt = worldFromEvent(e);
    if (!pt) return;
    const x = snap(pt.x, layout.gridSize, layout.snapToGrid);
    const y = snap(pt.y, layout.gridSize, layout.snapToGrid);
    const maxZ = Math.max(
      0,
      ...layout.items.map((i) => i.zIndex),
      ...layout.drawings.map((d) => d.zIndex)
    );

    if (tool === 'wall') {
      setWallDraft({ x1: x, y1: y, x2: x, y2: y });
      return;
    }
    if (tool === 'door') {
      const door: FloorPlanDoor = {
        id: uid('fpd'),
        kind: 'door',
        x,
        y,
        width: 48,
        height: 12,
        rotation: 0,
        color: '#6cb6ff',
        zIndex: maxZ + 1
      };
      onAddDrawing(door);
      onSelect(door.id);
      return;
    }
    if (tool === 'window') {
      const win: FloorPlanWindow = {
        id: uid('fpd'),
        kind: 'window',
        x,
        y,
        width: 56,
        height: 14,
        rotation: 0,
        color: '#3ecf8e',
        zIndex: maxZ + 1
      };
      onAddDrawing(win);
      onSelect(win.id);
      return;
    }
    if (tool === 'room-label') {
      const text = window.prompt('Room label', 'Room') || 'Room';
      const label: FloorPlanRoomLabel = {
        id: uid('fpd'),
        kind: 'room-label',
        x,
        y,
        text: text.trim() || 'Room',
        fontSize: 16,
        color: '#eef1f6',
        zIndex: maxZ + 1
      };
      onAddDrawing(label);
      onSelect(label.id);
    }
  }

  function handleStagePointerMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!wallDraft) return;
    const pt = worldFromEvent(e);
    if (!pt) return;
    setWallDraft({
      ...wallDraft,
      x2: snap(pt.x, layout.gridSize, layout.snapToGrid),
      y2: snap(pt.y, layout.gridSize, layout.snapToGrid)
    });
  }

  function handleStagePointerUp() {
    if (!wallDraft || !canEdit) return;
    const { x1, y1, x2, y2 } = wallDraft;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    setWallDraft(null);
    if (dist < 8) return;
    const maxZ = Math.max(
      0,
      ...layout.items.map((i) => i.zIndex),
      ...layout.drawings.map((d) => d.zIndex)
    );
    const wall: FloorPlanWall = {
      id: uid('fpd'),
      kind: 'wall',
      x1,
      y1,
      x2,
      y2,
      thickness: layout.wallThickness || 10,
      color: layout.wallColor || '#e8b84a',
      zIndex: maxZ + 1
    };
    onAddDrawing(wall);
    onSelect(wall.id);
  }

  const gridLines = useMemo(() => {
    if (!layout.snapToGrid) return null;
    const g = layout.gridSize || 20;
    const lines: JSX.Element[] = [];
    for (let x = 0; x <= layout.canvasWidth; x += g) {
      lines.push(
        <Line
          key={`vx${x}`}
          points={[x, 0, x, layout.canvasHeight]}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    for (let y = 0; y <= layout.canvasHeight; y += g) {
      lines.push(
        <Line
          key={`hy${y}`}
          points={[0, y, layout.canvasWidth, y]}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return lines;
  }, [layout.snapToGrid, layout.gridSize, layout.canvasWidth, layout.canvasHeight]);

  const cursor =
    panMode ? 'grab' : drawMode ? 'crosshair' : tool === 'delete' ? 'not-allowed' : 'default';

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-surface-600 bg-surface-900/80 px-2 py-1.5">
        <button type="button" className="btn-ghost btn-sm" onClick={() => zoomBy(1.15)}>
          Zoom +
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => zoomBy(1 / 1.15)}>
          Zoom −
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={fitView}>
          Fit
        </button>
        <span className="px-1 text-[11px] tabular-nums text-ink-dim">
          {Math.round(scale * 100)}%
        </span>
        <span className="hidden text-[11px] text-ink-dim sm:inline">
          · Scroll zoom · Space/pan tool to pan
          {canEdit ? ' · Del removes selection' : ' · View only'}
        </span>
        {bgLoading && (
          <span className="ml-auto text-[11px] text-amber-300">
            {pdfConverting ? 'Converting PDF to editable drawing…' : 'Loading drawing…'}
          </span>
        )}
        {!bgLoading && displayImage && (
          <span className="ml-auto text-[11px] text-emerald-400">
            Drawing loaded — zoom, pan, and edit on top
          </span>
        )}
        {!bgLoading && bgError && (
          <span className="ml-auto text-[11px] text-red-300">{bgError}</span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[#0c0e12]"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = canEdit ? 'copy' : 'none';
        }}
        onDrop={handleDrop}
      >
        <Stage
          ref={setStageNode}
          width={size.w}
          height={size.h}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={panMode}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const stage = e.target.getStage();
            if (!stage) return;
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            zoomBy(e.evt.deltaY > 0 ? 1 / 1.08 : 1.08, pointer);
          }}
          onMouseDown={handleStagePointerDown}
          onTouchStart={handleStagePointerDown}
          onMouseMove={handleStagePointerMove}
          onTouchMove={handleStagePointerMove}
          onMouseUp={handleStagePointerUp}
          onTouchEnd={handleStagePointerUp}
          style={{ cursor }}
        >
          <Layer>
            <Rect
              name="canvas-bg"
              width={layout.canvasWidth}
              height={layout.canvasHeight}
              fill="#141820"
              stroke="#2a3140"
              strokeWidth={2}
            />
            {displayImage && (
              <KonvaImage
                image={displayImage}
                width={layout.canvasWidth}
                height={layout.canvasHeight}
                listening={false}
              />
            )}
            {gridLines}
          </Layer>
          <Layer>
            {drawings.map((d) => {
              if (d.kind === 'wall') {
                return (
                  <WallNode
                    key={d.id}
                    wall={d}
                    selected={selectedId === d.id}
                    draggable={canEdit && tool === 'select' && !panMode}
                    onSelect={() => {
                      if (tool === 'delete' && canEdit) removeById(d.id);
                      else onSelect(d.id);
                    }}
                    onChange={(patch) => updateDrawing(d.id, patch)}
                  />
                );
              }
              if (d.kind === 'door') {
                return (
                  <DoorNode
                    key={d.id}
                    door={d}
                    selected={selectedId === d.id}
                    draggable={canEdit && tool === 'select' && !panMode}
                    onSelect={() => {
                      if (tool === 'delete' && canEdit) removeById(d.id);
                      else onSelect(d.id);
                    }}
                    onChange={(patch) => updateDrawing(d.id, patch)}
                  />
                );
              }
              if (d.kind === 'window') {
                return (
                  <WindowNode
                    key={d.id}
                    win={d}
                    selected={selectedId === d.id}
                    draggable={canEdit && tool === 'select' && !panMode}
                    onSelect={() => {
                      if (tool === 'delete' && canEdit) removeById(d.id);
                      else onSelect(d.id);
                    }}
                    onChange={(patch) => updateDrawing(d.id, patch)}
                  />
                );
              }
              return (
                <RoomLabelNode
                  key={d.id}
                  label={d}
                  selected={selectedId === d.id}
                  draggable={canEdit && tool === 'select' && !panMode}
                  onSelect={() => {
                    if (tool === 'delete' && canEdit) removeById(d.id);
                    else onSelect(d.id);
                  }}
                  onChange={(patch) => updateDrawing(d.id, patch)}
                />
              );
            })}
            {wallDraft && (
              <Line
                points={[wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2]}
                stroke={layout.wallColor || '#e8b84a'}
                strokeWidth={layout.wallThickness || 10}
                lineCap="round"
                opacity={0.7}
                listening={false}
              />
            )}
          </Layer>
          <Layer>
            {items.map((item) => (
              <PlacedItemNode
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                draggable={canEdit && tool === 'select' && !panMode}
                onSelect={() => {
                  if (tool === 'delete' && canEdit) removeById(item.id);
                  else onSelect(item.id);
                }}
                onChange={(patch) => updateItem(item.id, patch)}
                onDragEnd={(x, y) =>
                  updateItem(item.id, {
                    x: snap(x, layout.gridSize, layout.snapToGrid),
                    y: snap(y, layout.gridSize, layout.snapToGrid)
                  })
                }
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
