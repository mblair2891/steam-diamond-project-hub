'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { ProjectData } from '@/lib/types';
import { loadProject, saveProject } from '@/lib/storage';

type Updater = ProjectData | ((prev: ProjectData) => ProjectData);

interface ProjectContextValue {
  data: ProjectData;
  setData: (updater: Updater) => void;
  getKeysDate: () => string;
  getOpenDate: () => string;
  ready: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<ProjectData | null>(null);

  useEffect(() => {
    setDataState(loadProject());
  }, []);

  useEffect(() => {
    if (data) saveProject(data);
  }, [data]);

  const setData = useCallback((updater: Updater) => {
    setDataState((prev) => {
      if (!prev) return prev;
      return typeof updater === 'function' ? updater(prev) : updater;
    });
  }, []);

  const getKeysDate = useCallback(() => {
    if (!data) return '2026-08-01';
    const kd = data.keyDates.find((k) => k.id === 'kd_keys') || data.keyDates[0];
    return kd?.date || '2026-08-01';
  }, [data]);

  const getOpenDate = useCallback(() => {
    if (!data) return '2026-09-15';
    const kd = data.keyDates.find((k) => k.id === 'kd_open');
    return kd?.date || '2026-09-15';
  }, [data]);

  const value = useMemo(() => {
    if (!data) {
      return {
        data: loadProject(),
        setData,
        getKeysDate,
        getOpenDate,
        ready: false
      };
    }
    return { data, setData, getKeysDate, getOpenDate, ready: true };
  }, [data, setData, getKeysDate, getOpenDate]);

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-dim">
        Loading project…
      </div>
    );
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
