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
import { useUser } from '@clerk/nextjs';
import type {
  DocumentComment,
  FloorPlanComment,
  FloorPlanLayout,
  ProjectData,
  ReviewDocument
} from '@/lib/types';
import { loadProject, saveProject } from '@/lib/storage';
import { canEditProject, normalizeRole } from '@/lib/roles';

type Updater = ProjectData | ((prev: ProjectData) => ProjectData);

interface ProjectContextValue {
  data: ProjectData;
  setData: (updater: Updater) => void;
  /**
   * Append a comment (or reply) on a review document.
   * Allowed for every signed-in role including view-only.
   */
  addDocumentComment: (
    documentId: string,
    comment: Omit<DocumentComment, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ) => void;
  /**
   * Append a comment on a floor plan layout.
   * Allowed for every signed-in role including view-only.
   */
  addFloorPlanComment: (
    layoutId: string,
    comment: Omit<FloorPlanComment, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    }
  ) => void;
  getKeysDate: () => string;
  getOpenDate: () => string;
  ready: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function persist(next: ProjectData) {
  try {
    saveProject(next);
  } catch (err) {
    console.error('[SDH] Failed to save project', err);
  }
}

function authorFromUser(user: {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
}) {
  return user.fullName || user.firstName || user.username || 'User';
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [data, setDataState] = useState<ProjectData | null>(null);

  useEffect(() => {
    setDataState(loadProject());
  }, []);

  useEffect(() => {
    if (data) saveProject(data);
  }, [data]);

  const setData = useCallback(
    (updater: Updater) => {
      const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
      if (!canEditProject(role)) {
        console.warn('[SDH] Blocked write — role is view-only');
        return;
      }
      setDataState((prev) => {
        if (!prev) return prev;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persist(next);
        return next;
      });
    },
    [user]
  );

  const addDocumentComment = useCallback(
    (
      documentId: string,
      comment: Omit<DocumentComment, 'id' | 'createdAt'> & {
        id?: string;
        createdAt?: string;
      }
    ) => {
      if (!user?.id) {
        console.warn('[SDH] Blocked comment — not signed in');
        return;
      }
      const body = (comment.body || '').trim();
      if (!body) return;

      const full: DocumentComment = {
        id:
          comment.id ||
          `rdc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        parentId: comment.parentId ?? null,
        authorId: comment.authorId || user.id,
        authorName: comment.authorName || authorFromUser(user),
        body,
        createdAt: comment.createdAt || new Date().toISOString()
      };

      setDataState((prev) => {
        if (!prev) return prev;
        const docs = prev.reviewDocuments || [];
        const idx = docs.findIndex((d) => d.id === documentId);
        if (idx < 0) return prev;
        const doc = docs[idx];
        const nextDoc: ReviewDocument = {
          ...doc,
          comments: [...(doc.comments || []), full],
          updatedAt: new Date().toISOString()
        };
        const reviewDocuments = [...docs];
        reviewDocuments[idx] = nextDoc;
        const next = { ...prev, reviewDocuments };
        persist(next);
        return next;
      });
    },
    [user]
  );

  const addFloorPlanComment = useCallback(
    (
      layoutId: string,
      comment: Omit<FloorPlanComment, 'id' | 'createdAt'> & {
        id?: string;
        createdAt?: string;
      }
    ) => {
      if (!user?.id) {
        console.warn('[SDH] Blocked floor plan comment — not signed in');
        return;
      }
      const body = (comment.body || '').trim();
      if (!body) return;

      const full: FloorPlanComment = {
        id:
          comment.id ||
          `fpc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        parentId: comment.parentId ?? null,
        authorId: comment.authorId || user.id,
        authorName: comment.authorName || authorFromUser(user),
        body,
        createdAt: comment.createdAt || new Date().toISOString(),
        pinX: comment.pinX ?? null,
        pinY: comment.pinY ?? null
      };

      setDataState((prev) => {
        if (!prev) return prev;
        const plans = prev.floorPlans || [];
        const idx = plans.findIndex((p) => p.id === layoutId);
        if (idx < 0) return prev;
        const layout = plans[idx];
        const nextLayout: FloorPlanLayout = {
          ...layout,
          comments: [...(layout.comments || []), full],
          updatedAt: new Date().toISOString()
        };
        const floorPlans = [...plans];
        floorPlans[idx] = nextLayout;
        const next = { ...prev, floorPlans };
        persist(next);
        return next;
      });
    },
    [user]
  );

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
        addDocumentComment,
        addFloorPlanComment,
        getKeysDate,
        getOpenDate,
        ready: false
      };
    }
    return {
      data,
      setData,
      addDocumentComment,
      addFloorPlanComment,
      getKeysDate,
      getOpenDate,
      ready: true
    };
  }, [data, setData, addDocumentComment, addFloorPlanComment, getKeysDate, getOpenDate]);

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
