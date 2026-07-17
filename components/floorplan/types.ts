import type {
  FloorPlanDrawing,
  FloorPlanLayout,
  FloorPlanPlacedItem,
  FloorPlanTool
} from '@/lib/types';

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
  /** True when current user may edit this version (owner + editor/admin). */
  canEdit: boolean;
  tool: FloorPlanTool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onItemsChange: (items: FloorPlanPlacedItem[]) => void;
  onDrawingsChange: (drawings: FloorPlanDrawing[]) => void;
  onPlaceFromLibrary: (typeId: string, x: number, y: number) => void;
  onAddDrawing: (drawing: FloorPlanDrawing) => void;
  onDeleteSelected: () => void;
  stageRef?: React.MutableRefObject<FloorPlanStageHandle | null>;
}
