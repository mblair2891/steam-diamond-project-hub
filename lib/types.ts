export type Priority = 'High' | 'Medium' | 'Low';
export type ApprovalStatus = 'pending' | 'review' | 'approved' | 'rejected';
export type MediaEventType = 'post' | 'video' | 'announcement' | 'event' | 'image';
export type MediaDraftStatus = 'draft' | 'scheduled' | 'in-review' | 'approved' | 'published';
export type ShotStatus = 'planned' | 'filmed' | 'cut' | 'killed';
export type PhaseType = 'phase' | 'milestone';
/** Document review workflow statuses (display labels) */
export type DocumentReviewStatus = 'Draft' | 'Under Review' | 'Approved' | 'Rejected';

export const DOCUMENT_REVIEW_STATUSES: DocumentReviewStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Rejected'
];

export interface KeyDate {
  id: string;
  label: string;
  date: string;
}

export interface Phase {
  id: string;
  name: string;
  startOffset: number;
  endOffset: number;
  type: PhaseType;
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  /** Inclusive end date (YYYY-MM-DD) */
  due: string;
  /** Inclusive start date (YYYY-MM-DD); derived if missing */
  startDate?: string;
  /** Working length in days (default 7) */
  durationDays?: number;
  done: boolean;
  notes: string;
  category: string;
  /** Clerk user id */
  assigneeId?: string | null;
  /** Cached display name for assignee */
  assigneeName?: string | null;
  /** Task that must finish before this one starts */
  dependsOnId?: string | null;
}

export interface MediaEvent {
  id: string;
  title: string;
  /** Scheduled publish / post date (YYYY-MM-DD) */
  date: string;
  type: MediaEventType;
  channel: string;
  /** Description / caption body */
  notes: string;
  /** Draft workflow status */
  status?: MediaDraftStatus;
  /** Cloud file URL (Vercel Blob) */
  fileUrl?: string | null;
  /** Blob store pathname (preferred for signing) */
  pathname?: string | null;
  fileName?: string | null;
  mime?: string | null;
  size?: number | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
}

export interface MediaAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  /**
   * Legacy local data URL. Prefer `fileUrl` (Vercel Blob).
   * Kept for backwards compatibility with older localStorage data.
   */
  dataUrl?: string;
  /** Cloud storage URL (Vercel Blob) */
  fileUrl?: string;
  /** Blob store pathname (preferred for signing) */
  pathname?: string;
  notes: string;
  title?: string;
  description?: string;
  scheduledDate?: string;
  status?: MediaDraftStatus;
  addedAt: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
}

export interface Approval {
  id: string;
  title: string;
  owner: string;
  status: ApprovalStatus;
  notes: string;
  updatedAt: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
}

export interface FilmDay {
  id: string;
  date: string;
  title: string;
  location: string;
  notes: string;
}

export interface Shot {
  id: string;
  dayId: string;
  shot: string;
  status: ShotStatus;
}

export interface TimelineNote {
  id: string;
  date: string;
  title: string;
  body: string;
}

/** Threaded comment on a review document (any signed-in role may post). */
export interface DocumentComment {
  id: string;
  /** Parent comment id for replies; null = top-level */
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  /** ISO datetime */
  createdAt: string;
}

/** Lease, contract, or other PDF under collaborative review. */
export interface ReviewDocument {
  id: string;
  title: string;
  description: string;
  status: DocumentReviewStatus;
  /** Starts at 1; bump when main PDF is replaced */
  version: number;
  fileName?: string | null;
  fileUrl?: string | null;
  pathname?: string | null;
  mime?: string | null;
  size?: number | null;
  /** Attached redline / review-notes PDF */
  redlineFileName?: string | null;
  redlineFileUrl?: string | null;
  redlinePathname?: string | null;
  redlineMime?: string | null;
  redlineSize?: number | null;
  comments: DocumentComment[];
  /** ISO datetime */
  createdAt: string;
  /** ISO datetime */
  updatedAt: string;
  uploadedById?: string | null;
  uploadedByName?: string | null;
}

/** Comment on a floor plan layout (any signed-in role). */
export interface FloorPlanComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Optional pin on canvas (world coords) */
  pinX?: number | null;
  pinY?: number | null;
}

/** Single furniture/equipment instance on a layout. */
export interface FloorPlanPlacedItem {
  id: string;
  typeId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees */
  rotation: number;
  zIndex: number;
}

/** How an architectural element was created */
export type FloorPlanElementSource = 'manual' | 'auto';

/** Structural drawing: wall segment */
export interface FloorPlanWall {
  id: string;
  kind: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: string;
  zIndex: number;
  /** auto = AI / heuristic detection */
  source?: FloorPlanElementSource;
}

/** Structural drawing: door opening */
export interface FloorPlanDoor {
  id: string;
  kind: 'door';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  zIndex: number;
  source?: FloorPlanElementSource;
}

/** Structural drawing: window */
export interface FloorPlanWindow {
  id: string;
  kind: 'window';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  zIndex: number;
  source?: FloorPlanElementSource;
}

/** Text label for a room */
export interface FloorPlanRoomLabel {
  id: string;
  kind: 'room-label';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  zIndex: number;
  source?: FloorPlanElementSource;
}

/** Distinct styling for AI-detected elements */
export const AUTO_WALL_COLOR = '#c084fc';
export const AUTO_DOOR_COLOR = '#a78bfa';
export const AUTO_WINDOW_COLOR = '#22d3ee';

export type FloorPlanDrawing =
  | FloorPlanWall
  | FloorPlanDoor
  | FloorPlanWindow
  | FloorPlanRoomLabel;

export type FloorPlanTool =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'room-label'
  | 'delete'
  | 'pan';

/**
 * Personal floor plan version (cloud-synced).
 * Each user owns their versions — editing never overwrites another user’s plan.
 */
export interface FloorPlanLayout {
  id: string;
  name: string;
  description: string;
  /** Clerk user id of the owner */
  ownerId: string;
  /** Display name of the owner */
  ownerName: string;
  /** Public path or blob URL for building drawing background (prefer raster image) */
  backgroundUrl?: string | null;
  backgroundPathname?: string | null;
  backgroundName?: string | null;
  backgroundMime?: string | null;
  /** Optional original PDF kept for reference after raster conversion */
  sourcePdfUrl?: string | null;
  sourcePdfPathname?: string | null;
  sourcePdfName?: string | null;
  /** Set when a drawing is successfully loaded onto the canvas */
  drawingReady?: boolean;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  snapToGrid: boolean;
  /** Default thickness for new walls (px) */
  wallThickness: number;
  /** Default color for new walls */
  wallColor: string;
  items: FloorPlanPlacedItem[];
  /** Walls, doors, windows, room labels */
  drawings: FloorPlanDrawing[];
  comments: FloorPlanComment[];
  createdAt: string;
  updatedAt: string;
  updatedByName?: string | null;
  /** If created by copying another version */
  copiedFromId?: string | null;
  copiedFromOwnerName?: string | null;
}

export interface ProjectData {
  version: number;
  projectName: string;
  keyDates: KeyDate[];
  phases: Phase[];
  tasks: Task[];
  mediaEvents: MediaEvent[];
  mediaAssets: MediaAsset[];
  approvals: Approval[];
  filming: {
    days: FilmDay[];
    shots: Shot[];
  };
  timelineNotes: TimelineNote[];
  /** PDF leases, contracts, etc. with review comments */
  reviewDocuments: ReviewDocument[];
  /** Floor plan layout versions */
  floorPlans: FloorPlanLayout[];
  /** Last selected layout id */
  activeFloorPlanId?: string | null;
}

export function floorPlanBackgroundRef(
  layout: Pick<FloorPlanLayout, 'backgroundPathname' | 'backgroundUrl'>
): string {
  return layout.backgroundPathname || layout.backgroundUrl || '';
}

/** Documents in Draft or Under Review need attention. */
export function documentNeedsReview(doc: Pick<ReviewDocument, 'status'>): boolean {
  return doc.status === 'Draft' || doc.status === 'Under Review';
}

export function reviewDocumentFileRef(
  d: Pick<ReviewDocument, 'pathname' | 'fileUrl'>
): string {
  return d.pathname || d.fileUrl || '';
}

export function reviewDocumentRedlineRef(
  d: Pick<ReviewDocument, 'redlinePathname' | 'redlineFileUrl'>
): string {
  return d.redlinePathname || d.redlineFileUrl || '';
}

export interface AssignableUser {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
}

/**
 * Raw storage reference for a private blob (pathname or full blob URL).
 * Pass this into MediaPreview / useSignedMediaUrl — they mint signed GET URLs
 * server-side so private store files can be viewed by signed-in users.
 */
export function privateBlobViewUrl(fileUrlOrPath?: string | null): string {
  if (!fileUrlOrPath) return '';
  return fileUrlOrPath.trim();
}

/** Best media reference for signing/streaming (pathname > fileUrl > dataUrl). */
export function mediaAssetUrl(
  a: Pick<MediaAsset, 'fileUrl' | 'dataUrl' | 'pathname'>
): string {
  if (a.pathname) return a.pathname;
  if (a.fileUrl) return a.fileUrl;
  return a.dataUrl || '';
}

export function mediaEventFileUrl(
  e: Pick<MediaEvent, 'fileUrl' | 'pathname'>
): string {
  return e.pathname || e.fileUrl || '';
}
