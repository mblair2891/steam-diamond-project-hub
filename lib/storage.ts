import type {
  DocumentComment,
  DocumentReviewStatus,
  MediaAsset,
  MediaEvent,
  ProjectData,
  ReviewDocument,
  Task
} from './types';
import { DOCUMENT_REVIEW_STATUSES } from './types';
import { buildSampleData } from './sampleData';
import { cascadeTaskDependencies, normalizeTask } from './tasks';

const KEY = 'sdh_project_v2';

function migrateMediaAsset(a: MediaAsset): MediaAsset {
  return {
    ...a,
    // Prefer cloud URL; keep legacy dataUrl if present
    fileUrl: a.fileUrl || undefined,
    dataUrl: a.dataUrl || undefined,
    status: a.status || 'draft',
    title: a.title || a.name,
    description: a.description || a.notes || ''
  };
}

function migrateMediaEvent(e: MediaEvent): MediaEvent {
  return {
    ...e,
    status: e.status || 'scheduled',
    fileUrl: e.fileUrl ?? null,
    fileName: e.fileName ?? null,
    mime: e.mime ?? null,
    size: e.size ?? null,
    assigneeId: e.assigneeId ?? null,
    assigneeName: e.assigneeName ?? null
  };
}

function normalizeDocStatus(raw: unknown): DocumentReviewStatus {
  const s = String(raw ?? '').trim();
  if ((DOCUMENT_REVIEW_STATUSES as string[]).includes(s)) {
    return s as DocumentReviewStatus;
  }
  const lower = s.toLowerCase();
  if (lower === 'draft') return 'Draft';
  if (lower === 'under review' || lower === 'under-review' || lower === 'review') {
    return 'Under Review';
  }
  if (lower === 'approved') return 'Approved';
  if (lower === 'rejected') return 'Rejected';
  return 'Draft';
}

function migrateComment(c: DocumentComment): DocumentComment {
  return {
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.authorId || '',
    authorName: c.authorName || 'User',
    body: c.body || '',
    createdAt: c.createdAt || new Date().toISOString()
  };
}

function migrateReviewDocument(d: ReviewDocument): ReviewDocument {
  return {
    ...d,
    title: d.title || 'Untitled document',
    description: d.description || '',
    status: normalizeDocStatus(d.status),
    version: typeof d.version === 'number' && d.version > 0 ? d.version : 1,
    fileName: d.fileName ?? null,
    fileUrl: d.fileUrl ?? null,
    pathname: d.pathname ?? null,
    mime: d.mime ?? null,
    size: d.size ?? null,
    redlineFileName: d.redlineFileName ?? null,
    redlineFileUrl: d.redlineFileUrl ?? null,
    redlinePathname: d.redlinePathname ?? null,
    redlineMime: d.redlineMime ?? null,
    redlineSize: d.redlineSize ?? null,
    comments: Array.isArray(d.comments) ? d.comments.map(migrateComment) : [],
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
    uploadedById: d.uploadedById ?? null,
    uploadedByName: d.uploadedByName ?? null
  };
}

function migrateProject(data: ProjectData): ProjectData {
  const tasks = cascadeTaskDependencies((data.tasks || []).map((t: Task) => normalizeTask(t)));
  const mediaAssets = (data.mediaAssets || []).map(migrateMediaAsset);
  const mediaEvents = (data.mediaEvents || []).map(migrateMediaEvent);
  const approvals = (data.approvals || []).map((a) => ({
    ...a,
    assigneeId: a.assigneeId ?? null,
    assigneeName: a.assigneeName ?? null
  }));
  const reviewDocuments = (data.reviewDocuments || []).map(migrateReviewDocument);
  return {
    ...data,
    version: Math.max(data.version || 1, 3),
    tasks,
    mediaAssets,
    mediaEvents,
    approvals,
    reviewDocuments
  };
}

export function loadProject(): ProjectData {
  if (typeof window === 'undefined') return buildSampleData();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const data = buildSampleData();
      saveProject(data);
      return data;
    }
    return migrateProject(JSON.parse(raw) as ProjectData);
  } catch {
    const data = buildSampleData();
    saveProject(data);
    return data;
  }
}

export function saveProject(data: ProjectData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function exportProjectJSON(data: ProjectData): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), project: data }, null, 2);
}

export function exportCalendarCSV(events: MediaEvent[]): string {
  const rows = [['Date', 'Title', 'Type', 'Channel', 'Status', 'Notes', 'File URL']];
  [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) =>
      rows.push([
        e.date,
        e.title,
        e.type,
        e.channel || '',
        e.status || '',
        e.notes || '',
        e.fileUrl || ''
      ])
    );
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
