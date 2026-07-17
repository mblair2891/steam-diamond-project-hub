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
import type { FloorPlanLayout, FloorPlanPlacedItem } from '@/lib/types';
import PlacedItemNode from './PlacedItemNode';

function useHtmlImage(src?: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) {
        setImage(img);
        setError(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setImage(null);
        setError('Could not load floor plan background.');
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return { image, error };
}

function snap(value: number, grid: number, enabled: boolean) {
  if (!enabled || grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export interface FloorPlanCanvasProps {
  layout: FloorPlanLayout;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onItemsChange: (items: FloorPlanPlacedItem[]) => void;
  onPlaceFromLibrary: (typeId: string, x: number, y: number) => void;
  stageRef?: React.MutableRefObject<Konva.Stage | null>;
}

export default function FloorPlanCanvas({
  layout,
  canEdit,
  selectedId,
  onSelect,
  onItemsChange,
  onPlaceFromLibrary,
  stageRef: externalStageRef
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [scale, setScale] = useState(0.55);
  const [stagePos, setStagePos] = useState({ x: 40, y: 20 });
  const [spacePan, setSpacePan] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const bgRef = layout.backgroundPathname || layout.backgroundUrl || '';
  const isPublic = bgRef.startsWith('/') && !bgRef.startsWith('/api/');
  const { url: signedBg, streamUrl, loading: bgLoading, error: bgSignError } = useSignedMediaUrl(
    isPublic ? null : bgRef || null,
    { filename: layout.backgroundName || undefined }
  );
  const bgSrc = isPublic ? bgRef : signedBg || streamUrl || null;
  const { image: bgImage, error: bgLoadError } = useHtmlImage(bgSrc);

  const items = useMemo(
    () => [...(layout.items || [])].sort((a, b) => a.zIndex - b.zIndex),
    [layout.items]
  );

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
        onItemsChange(layout.items.filter((i) => i.id !== selectedId));
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
  }, [canEdit, selectedId, layout.items, onItemsChange, onSelect]);

  const setStageNode = useCallback(
    (node: Konva.Stage | null) => {
      stageRef.current = node;
      if (externalStageRef) externalStageRef.current = node;
    },
    [externalStageRef]
  );

  const zoomBy = useCallback((factor: number, center?: { x: number; y: number }) => {
    setScale((prev) => {
      const next = Math.min(3, Math.max(0.2, prev * factor));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit when layout canvas size changes
  }, [layout.id, layout.canvasWidth, layout.canvasHeight, size.w, size.h]);

  function updateItem(id: string, patch: Partial<FloorPlanPlacedItem>) {
    onItemsChange(
      layout.items.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        if (layout.snapToGrid && (patch.x != null || patch.y != null)) {
          next.x = snap(next.x, layout.gridSize, true);
          next.y = snap(next.y, layout.gridSize, true);
        }
        if (layout.snapToGrid && (patch.width != null || patch.height != null)) {
          next.width = Math.max(16, snap(next.width, layout.gridSize, true) || next.width);
          next.height = Math.max(16, snap(next.height, layout.gridSize, true) || next.height);
        }
        return next;
      })
    );
  }

  function handleDrop(e: ReactDragEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const typeId = e.dataTransfer.getData('application/x-sdh-floorplan-type');
    if (!typeId || !stageRef.current) return;
    const stage = stageRef.current;
    stage.setPointersPositions(e);
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const x = (pointer.x - stage.x()) / stage.scaleX();
    const y = (pointer.y - stage.y()) / stage.scaleY();
    const catalog = getCatalogItem(typeId);
    const cx = x - (catalog?.defaultW || 48) / 2;
    const cy = y - (catalog?.defaultH || 48) / 2;
    onPlaceFromLibrary(
      typeId,
      snap(cx, layout.gridSize, layout.snapToGrid),
      snap(cy, layout.gridSize, layout.snapToGrid)
    );
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
          · Scroll to zoom · Space+drag to pan
          {canEdit ? ' · Delete key removes selection' : ''}
        </span>
        {(bgLoading || bgSignError || bgLoadError) && (
          <span className="ml-auto text-[11px] text-amber-300">
            {bgLoading
              ? 'Loading background…'
              : bgSignError || bgLoadError || 'Background issue'}
          </span>
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
          draggable={spacePan || isPanning}
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
            const direction = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
            zoomBy(direction, pointer);
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.getClassName() === 'Image') {
              if (e.evt.button === 1 || spacePan) {
                setIsPanning(true);
                return;
              }
              onSelect(null);
            }
          }}
          onMouseUp={() => setIsPanning(false)}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
          }}
          style={{ cursor: spacePan || isPanning ? 'grab' : 'default' }}
        >
          <Layer>
            <Rect
              width={layout.canvasWidth}
              height={layout.canvasHeight}
              fill="#141820"
              stroke="#2a3140"
              strokeWidth={2}
            />
            {bgImage && (
              <KonvaImage
                image={bgImage}
                width={layout.canvasWidth}
                height={layout.canvasHeight}
                listening={false}
              />
            )}
            {gridLines}
          </Layer>
          <Layer>
            {items.map((item) => (
              <PlacedItemNode
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                draggable={canEdit && !spacePan}
                onSelect={() => onSelect(item.id)}
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
