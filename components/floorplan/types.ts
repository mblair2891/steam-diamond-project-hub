import type { FloorPlanLayout, FloorPlanPlacedItem } from '@/lib/types';

/**
 * Minimal stage handle for PNG/PDF export — avoids importing konva types
 * into parent pages (which can pull Konva into the SSR graph).
 */
export type FloorPlanStageHandle = {
  toDataURL: (config?: {
    pixelRatio?: number;
    mimeType?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => string;
  scale: (s: { x: number; y: number }) => void;
  position: (p: { x: number; y: number }) => void;
  scaleX: () => number;
  scaleY: () => number;
  x: () => number;
  y: () => number;
  batchDraw: () => void;
};

export interface FloorPlanCanvasProps {
  layout: FloorPlanLayout;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onItemsChange: (items: FloorPlanPlacedItem[]) => void;
  onPlaceFromLibrary: (typeId: string, x: number, y: number) => void;
  stageRef?: React.MutableRefObject<FloorPlanStageHandle | null>;
}
