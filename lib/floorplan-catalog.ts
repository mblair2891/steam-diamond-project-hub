/** Catalog of draggable furniture & equipment for the Floor Plan Builder. */

export type FloorPlanCategory = 'tables' | 'seating' | 'kitchen' | 'bar' | 'other';

export type FloorPlanShapeKind =
  | 'rect'
  | 'round-rect'
  | 'circle'
  | 'ellipse'
  | 'booth'
  | 'counter'
  | 'l-shape'
  | 'sink'
  | 'stool'
  | 'plant'
  | 'partition'
  | 'stage'
  | 'restroom'
  | 'pos'
  | 'hood';

export interface FloorPlanCatalogItem {
  typeId: string;
  category: FloorPlanCategory;
  label: string;
  defaultW: number;
  defaultH: number;
  /** Fill color (semi-transparent on canvas) */
  color: string;
  stroke: string;
  shape: FloorPlanShapeKind;
  /** Short symbol for library list */
  symbol: string;
}

export const FLOOR_PLAN_CATEGORIES: { id: FloorPlanCategory; label: string }[] = [
  { id: 'tables', label: 'Tables' },
  { id: 'seating', label: 'Seating' },
  { id: 'kitchen', label: 'Kitchen Equipment' },
  { id: 'bar', label: 'Bar Equipment' },
  { id: 'other', label: 'Other' }
];

export const FLOOR_PLAN_CATALOG: FloorPlanCatalogItem[] = [
  // Tables
  {
    typeId: 'table-2top',
    category: 'tables',
    label: '2-top',
    defaultW: 56,
    defaultH: 56,
    color: 'rgba(232,184,74,0.35)',
    stroke: '#e8b84a',
    shape: 'circle',
    symbol: '②'
  },
  {
    typeId: 'table-4top',
    category: 'tables',
    label: '4-top',
    defaultW: 72,
    defaultH: 72,
    color: 'rgba(232,184,74,0.4)',
    stroke: '#e8b84a',
    shape: 'circle',
    symbol: '④'
  },
  {
    typeId: 'table-6top',
    category: 'tables',
    label: '6-top',
    defaultW: 96,
    defaultH: 72,
    color: 'rgba(232,184,74,0.4)',
    stroke: '#e8b84a',
    shape: 'ellipse',
    symbol: '⑥'
  },
  {
    typeId: 'table-round',
    category: 'tables',
    label: 'Round table',
    defaultW: 88,
    defaultH: 88,
    color: 'rgba(232,184,74,0.38)',
    stroke: '#e8b84a',
    shape: 'circle',
    symbol: '○'
  },
  {
    typeId: 'table-square',
    category: 'tables',
    label: 'Square table',
    defaultW: 72,
    defaultH: 72,
    color: 'rgba(232,184,74,0.38)',
    stroke: '#e8b84a',
    shape: 'round-rect',
    symbol: '□'
  },
  {
    typeId: 'table-booth',
    category: 'tables',
    label: 'Booth table',
    defaultW: 100,
    defaultH: 64,
    color: 'rgba(232,184,74,0.35)',
    stroke: '#e8b84a',
    shape: 'booth',
    symbol: '⊓'
  },

  // Seating
  {
    typeId: 'chair',
    category: 'seating',
    label: 'Chair',
    defaultW: 28,
    defaultH: 28,
    color: 'rgba(108,182,255,0.35)',
    stroke: '#6cb6ff',
    shape: 'round-rect',
    symbol: '🪑'
  },
  {
    typeId: 'bar-stool',
    category: 'seating',
    label: 'Bar stool',
    defaultW: 26,
    defaultH: 26,
    color: 'rgba(108,182,255,0.4)',
    stroke: '#6cb6ff',
    shape: 'stool',
    symbol: '◉'
  },
  {
    typeId: 'couch',
    category: 'seating',
    label: 'Couch',
    defaultW: 120,
    defaultH: 48,
    color: 'rgba(192,132,252,0.35)',
    stroke: '#c084fc',
    shape: 'round-rect',
    symbol: '▭'
  },
  {
    typeId: 'booth-seat',
    category: 'seating',
    label: 'Booth',
    defaultW: 110,
    defaultH: 48,
    color: 'rgba(192,132,252,0.35)',
    stroke: '#c084fc',
    shape: 'booth',
    symbol: '⊓'
  },
  {
    typeId: 'banquette',
    category: 'seating',
    label: 'Banquette',
    defaultW: 160,
    defaultH: 40,
    color: 'rgba(192,132,252,0.32)',
    stroke: '#c084fc',
    shape: 'round-rect',
    symbol: '═'
  },

  // Kitchen
  {
    typeId: 'hood',
    category: 'kitchen',
    label: 'Hood',
    defaultW: 140,
    defaultH: 70,
    color: 'rgba(244,114,182,0.3)',
    stroke: '#f472b6',
    shape: 'hood',
    symbol: '⌂'
  },
  {
    typeId: 'prep-table',
    category: 'kitchen',
    label: 'Prep table',
    defaultW: 120,
    defaultH: 48,
    color: 'rgba(244,114,182,0.28)',
    stroke: '#f472b6',
    shape: 'rect',
    symbol: '▭'
  },
  {
    typeId: 'fryer',
    category: 'kitchen',
    label: 'Fryer',
    defaultW: 48,
    defaultH: 56,
    color: 'rgba(244,114,182,0.35)',
    stroke: '#f472b6',
    shape: 'round-rect',
    symbol: '▣'
  },
  {
    typeId: 'grill',
    category: 'kitchen',
    label: 'Grill / pit',
    defaultW: 100,
    defaultH: 64,
    color: 'rgba(244,114,182,0.38)',
    stroke: '#f472b6',
    shape: 'rect',
    symbol: '▦'
  },
  {
    typeId: 'sink',
    category: 'kitchen',
    label: 'Sink',
    defaultW: 56,
    defaultH: 40,
    color: 'rgba(108,182,255,0.3)',
    stroke: '#6cb6ff',
    shape: 'sink',
    symbol: '▭'
  },
  {
    typeId: 'cooler',
    category: 'kitchen',
    label: 'Cooler',
    defaultW: 64,
    defaultH: 80,
    color: 'rgba(108,182,255,0.28)',
    stroke: '#6cb6ff',
    shape: 'rect',
    symbol: '❄'
  },
  {
    typeId: 'oven',
    category: 'kitchen',
    label: 'Oven',
    defaultW: 56,
    defaultH: 56,
    color: 'rgba(244,114,182,0.32)',
    stroke: '#f472b6',
    shape: 'round-rect',
    symbol: '▣'
  },
  {
    typeId: 'dishwasher',
    category: 'kitchen',
    label: 'Dishwasher',
    defaultW: 56,
    defaultH: 56,
    color: 'rgba(108,182,255,0.28)',
    stroke: '#6cb6ff',
    shape: 'round-rect',
    symbol: '◇'
  },

  // Bar
  {
    typeId: 'bar-counter',
    category: 'bar',
    label: 'Bar counter',
    defaultW: 200,
    defaultH: 40,
    color: 'rgba(108,182,255,0.35)',
    stroke: '#6cb6ff',
    shape: 'counter',
    symbol: '━'
  },
  {
    typeId: 'bar-stool-bar',
    category: 'bar',
    label: 'Bar stool',
    defaultW: 26,
    defaultH: 26,
    color: 'rgba(108,182,255,0.4)',
    stroke: '#6cb6ff',
    shape: 'stool',
    symbol: '◉'
  },
  {
    typeId: 'back-bar',
    category: 'bar',
    label: 'Back bar',
    defaultW: 48,
    defaultH: 140,
    color: 'rgba(108,182,255,0.28)',
    stroke: '#6cb6ff',
    shape: 'rect',
    symbol: '▮'
  },
  {
    typeId: 'taps',
    category: 'bar',
    label: 'Tap tower',
    defaultW: 40,
    defaultH: 48,
    color: 'rgba(232,184,74,0.4)',
    stroke: '#e8b84a',
    shape: 'round-rect',
    symbol: '⊥'
  },
  {
    typeId: 'speed-rail',
    category: 'bar',
    label: 'Speed rail',
    defaultW: 100,
    defaultH: 24,
    color: 'rgba(108,182,255,0.3)',
    stroke: '#6cb6ff',
    shape: 'rect',
    symbol: '═'
  },

  // Other
  {
    typeId: 'host-stand',
    category: 'other',
    label: 'Host stand',
    defaultW: 56,
    defaultH: 40,
    color: 'rgba(62,207,142,0.35)',
    stroke: '#3ecf8e',
    shape: 'round-rect',
    symbol: '⌂'
  },
  {
    typeId: 'pos',
    category: 'other',
    label: 'POS station',
    defaultW: 40,
    defaultH: 40,
    color: 'rgba(62,207,142,0.35)',
    stroke: '#3ecf8e',
    shape: 'pos',
    symbol: '▣'
  },
  {
    typeId: 'plant',
    category: 'other',
    label: 'Plant',
    defaultW: 32,
    defaultH: 32,
    color: 'rgba(62,207,142,0.4)',
    stroke: '#3ecf8e',
    shape: 'plant',
    symbol: '❀'
  },
  {
    typeId: 'partition',
    category: 'other',
    label: 'Partition',
    defaultW: 120,
    defaultH: 16,
    color: 'rgba(139,147,167,0.45)',
    stroke: '#8b93a7',
    shape: 'partition',
    symbol: '|'
  },
  {
    typeId: 'stage',
    category: 'other',
    label: 'Stage',
    defaultW: 160,
    defaultH: 100,
    color: 'rgba(232,184,74,0.25)',
    stroke: '#e8b84a',
    shape: 'stage',
    symbol: '▤'
  },
  {
    typeId: 'dj-booth',
    category: 'other',
    label: 'DJ booth',
    defaultW: 80,
    defaultH: 56,
    color: 'rgba(192,132,252,0.35)',
    stroke: '#c084fc',
    shape: 'round-rect',
    symbol: '♫'
  },
  {
    typeId: 'restroom',
    category: 'other',
    label: 'Restroom',
    defaultW: 64,
    defaultH: 64,
    color: 'rgba(139,147,167,0.3)',
    stroke: '#8b93a7',
    shape: 'restroom',
    symbol: 'WC'
  },
  {
    typeId: 'storage',
    category: 'other',
    label: 'Storage',
    defaultW: 72,
    defaultH: 56,
    color: 'rgba(139,147,167,0.28)',
    stroke: '#8b93a7',
    shape: 'rect',
    symbol: '▣'
  }
];

export function getCatalogItem(typeId: string): FloorPlanCatalogItem | undefined {
  return FLOOR_PLAN_CATALOG.find((c) => c.typeId === typeId);
}

export const DEFAULT_FLOOR_PLAN_BG = '/floor-plans/default-floor-plan.svg';
export const DEFAULT_CANVAS_W = 1400;
export const DEFAULT_CANVAS_H = 1000;
export const DEFAULT_GRID_SIZE = 20;
