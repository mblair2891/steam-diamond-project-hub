'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import {
  BLOB_MAX_BYTES,
  uploadToBlob,
  type BlobUploadResult,
  type UploadPhase
} from '@/lib/blob-upload';
import { uid } from '@/lib/dates';
import type { MediaAsset } from '@/lib/types';

export type UploadJobKind = 'library' | 'attach';

export interface UploadJob {
  id: string;
  name: string;
  mime: string;
  size: number;
  progress: number;
  phase: UploadPhase;
  previewUrl: string | null;
  error?: string;
  folder: string;
  kind: UploadJobKind;
  result?: BlobUploadResult;
  /** Set when kind=library after metadata is written */
  assetId?: string;
}

interface StartUploadOptions {
  file: File;
  folder?: string;
  kind?: UploadJobKind;
  /** Called when blob upload finishes (even if user left the page). */
  onComplete?: (result: BlobUploadResult, jobId: string) => void;
  onError?: (error: Error, jobId: string) => void;
}

interface UploadManagerValue {
  jobs: UploadJob[];
  activeCount: number;
  startUpload: (opts: StartUploadOptions) => string;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
}

const UploadManagerContext = createContext<UploadManagerValue | null>(null);

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

type JobMeta = {
  file: File;
  folder: string;
  kind: UploadJobKind;
  name: string;
  onComplete?: StartUploadOptions['onComplete'];
  onError?: StartUploadOptions['onError'];
};

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const { setData } = useProject();
  const { success, error: toastError, info } = useToast();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  /** Survive page unmount — do not put File/callbacks only in React state */
  const metaRef = useRef<Map<string, JobMeta>>(new Map());

  const patchJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const dismissJob = useCallback((id: string) => {
    setJobs((list) => {
      const job = list.find((j) => j.id === id);
      if (job?.previewUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(job.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return list.filter((j) => j.id !== id);
    });
    metaRef.current.delete(id);
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((list) => {
      list.forEach((j) => {
        if (
          (j.phase === 'complete' || j.phase === 'error') &&
          j.previewUrl?.startsWith('blob:')
        ) {
          try {
            URL.revokeObjectURL(j.previewUrl);
          } catch {
            /* ignore */
          }
        }
      });
      return list.filter((j) => j.phase !== 'complete' && j.phase !== 'error');
    });
  }, []);

  const runJob = useCallback(
    async (jobId: string) => {
      const meta = metaRef.current.get(jobId);
      if (!meta) {
        patchJob(jobId, {
          phase: 'error',
          error: 'File missing from upload queue.',
          progress: 0
        });
        return;
      }

      const { file, folder, kind, name, onComplete, onError } = meta;

      try {
        patchJob(jobId, { phase: 'uploading', progress: 1, error: undefined });

        const result = await uploadToBlob({
          file,
          folder,
          onPhase: (phase) => patchJob(jobId, { phase }),
          onProgress: (pct) => patchJob(jobId, { progress: pct })
        });

        // Finalize UI past the "99%" plateau, then persist metadata
        patchJob(jobId, {
          phase: 'processing',
          progress: 99,
          result
        });

        let assetId: string | undefined;

        if (kind === 'library') {
          assetId = uid('ma');
          const asset: MediaAsset = {
            id: assetId,
            name: result.name,
            mime: result.contentType,
            size: result.size,
            fileUrl: result.url,
            notes: '',
            title: result.name.replace(/\.[^.]+$/, '') || result.name,
            description: '',
            scheduledDate: '',
            status: 'draft',
            addedAt: new Date().toISOString(),
            assigneeId: null,
            assigneeName: null
          };

          // Synchronous save via ProjectProvider (writes localStorage immediately)
          setData((d) => ({
            ...d,
            mediaAssets: [...d.mediaAssets, asset]
          }));
        }

        patchJob(jobId, {
          phase: 'complete',
          progress: 100,
          result,
          assetId
        });

        success(
          'Uploaded successfully',
          kind === 'library'
            ? `${name} saved to Media Library · ${formatBytes(result.size)}`
            : `${name} ready · ${formatBytes(result.size)}`
        );

        try {
          onComplete?.(result, jobId);
        } catch (cbErr) {
          console.warn('[upload] onComplete handler error', cbErr);
        }

        window.setTimeout(() => dismissJob(jobId), 5000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        patchJob(jobId, {
          phase: 'error',
          error: message,
          progress: 0
        });
        toastError('Upload failed', message);
        try {
          onError?.(err instanceof Error ? err : new Error(message), jobId);
        } catch {
          /* ignore */
        }
      } finally {
        // Keep meta until dismiss so UI can still show name; drop File blob
        const m = metaRef.current.get(jobId);
        if (m) {
          metaRef.current.set(jobId, { ...m, file: m.file });
        }
      }
    },
    [dismissJob, patchJob, setData, success, toastError]
  );

  const startUpload = useCallback(
    (opts: StartUploadOptions): string => {
      const { file, folder = 'media', kind = 'library', onComplete, onError } = opts;

      if (file.size > BLOB_MAX_BYTES) {
        const msg = `${file.name} exceeds the 100MB limit.`;
        toastError('File too large', msg);
        throw new Error(msg);
      }
      if (file.size === 0) {
        const msg = `${file.name} has no content.`;
        toastError('Empty file', msg);
        throw new Error(msg);
      }

      const id = uid('up');
      const previewUrl = URL.createObjectURL(file);

      metaRef.current.set(id, {
        file,
        folder,
        kind,
        name: file.name,
        onComplete,
        onError
      });

      const job: UploadJob = {
        id,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        progress: 0,
        phase: 'queued',
        previewUrl,
        folder,
        kind
      };

      setJobs((list) => [...list, job]);
      info('Upload started', `${file.name} · ${formatBytes(file.size)}`);

      // Detached promise — survives Media page unmount / route changes
      void runJob(id);

      return id;
    },
    [info, runJob, toastError]
  );

  const activeCount = jobs.filter(
    (j) => j.phase === 'queued' || j.phase === 'uploading' || j.phase === 'processing'
  ).length;

  const value = useMemo(
    () => ({
      jobs,
      activeCount,
      startUpload,
      dismissJob,
      clearFinished
    }),
    [jobs, activeCount, startUpload, dismissJob, clearFinished]
  );

  return (
    <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>
  );
}

export function useUploadManager() {
  const ctx = useContext(UploadManagerContext);
  if (!ctx) throw new Error('useUploadManager must be used within UploadManagerProvider');
  return ctx;
}
