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
import type { DocumentComment, ProjectData, ReviewDocument } from '@/lib/types';
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
        // Persist immediately so media metadata survives navigation mid-upload
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
        authorName:
          comment.authorName ||
          user.fullName ||
          user.firstName ||
          user.username ||
          'User',
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
        getKeysDate,
        getOpenDate,
        ready: false
      };
    }
    return { data, setData, addDocumentComment, getKeysDate, getOpenDate, ready: true };
  }, [data, setData, addDocumentComment, getKeysDate, getOpenDate]);

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
