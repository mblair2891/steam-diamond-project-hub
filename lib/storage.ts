import type { MediaEvent, ProjectData, Task } from './types';
import { buildSampleData } from './sampleData';
import { cascadeTaskDependencies, normalizeTask } from './tasks';

const KEY = 'sdh_project_v2';

function migrateProject(data: ProjectData): ProjectData {
  const tasks = cascadeTaskDependencies((data.tasks || []).map((t: Task) => normalizeTask(t)));
  return { ...data, tasks };
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
  const rows = [['Date', 'Title', 'Type', 'Channel', 'Notes']];
  [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) => rows.push([e.date, e.title, e.type, e.channel || '', e.notes || '']));
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
