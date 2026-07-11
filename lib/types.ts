export type Priority = 'High' | 'Medium' | 'Low';
export type ApprovalStatus = 'pending' | 'review' | 'approved' | 'rejected';
export type MediaEventType = 'post' | 'video' | 'announcement' | 'event';
export type ShotStatus = 'planned' | 'filmed' | 'cut' | 'killed';
export type PhaseType = 'phase' | 'milestone';

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
  due: string;
  done: boolean;
  notes: string;
  category: string;
}

export interface MediaEvent {
  id: string;
  title: string;
  date: string;
  type: MediaEventType;
  channel: string;
  notes: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  notes: string;
  addedAt: string;
}

export interface Approval {
  id: string;
  title: string;
  owner: string;
  status: ApprovalStatus;
  notes: string;
  updatedAt: string;
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
}
