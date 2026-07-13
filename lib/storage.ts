import type { MediaAsset, MediaEvent, ProjectData, Task } from './types';
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

function migrateProject(data: ProjectData): ProjectData {
  const tasks = cascadeTaskDependencies((data.tasks || []).map((t: Task) => normalizeTask(t)));
  const mediaAssets = (data.mediaAssets || []).map(migrateMediaAsset);
  const mediaEvents = (data.mediaEvents || []).map(migrateMediaEvent);
  const approvals = (data.approvals || []).map((a) => ({
    ...a,
    assigneeId: a.assigneeId ?? null,
    assigneeName: a.assigneeName ?? null
  }));
  return {
    ...data,
    version: Math.max(data.version || 1, 2),
    tasks,
    mediaAssets,
    mediaEvents,
    approvals
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
