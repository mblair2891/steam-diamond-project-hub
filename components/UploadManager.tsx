'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import {
  BLOB_MAX_BYTES,
  UPLOAD_MAX_ATTEMPTS,
  uploadToBlob,
  type BlobUploadResult,
  type UploadPhase
} from '@/lib/blob-upload';
import { uid } from '@/lib/dates';
import { notifyMediaLibraryChanged, saveMediaMeta } from '@/lib/media-client';
import { saveProject } from '@/lib/storage';
import type { MediaAsset, ProjectData } from '@/lib/types';

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
  assetId?: string;
  attempt: number;
  maxAttempts: number;
  /** True while user can click Retry (file still in memory) */
  canRetry: boolean;
}

interface StartUploadOptions {
  file: File;
  folder?: string;
  kind?: UploadJobKind;
  onComplete?: (result: BlobUploadResult, jobId: string) => void;
  onError?: (error: Error, jobId: string) => void;
}

interface UploadManagerValue {
  jobs: UploadJob[];
  activeCount: number;
  hasActiveUploads: boolean;
  startUpload: (opts: StartUploadOptions) => string;
  retryJob: (id: string) => void;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
}

const UploadManagerContext = createContext<UploadManagerValue | null>(null);

const STATUS_KEY = 'sdh_upload_status_v1';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function isActivePhase(phase: UploadPhase) {
  return (
    phase === 'queued' ||
    phase === 'uploading' ||
    phase === 'processing' ||
    phase === 'retrying'
  );
}

type JobMeta = {
  file: File;
  folder: string;
  kind: UploadJobKind;
  name: string;
  onComplete?: StartUploadOptions['onComplete'];
  onError?: StartUploadOptions['onError'];
};

/** Snapshot (no File) so status survives soft reloads / debugging */
function persistStatus(jobs: UploadJob[]) {
  if (typeof window === 'undefined') return;
  try {
    const slim = jobs.map((j) => ({
      id: j.id,
      name: j.name,
      mime: j.mime,
      size: j.size,
      progress: j.progress,
      phase: j.phase,
      error: j.error,
      folder: j.folder,
      kind: j.kind,
      attempt: j.attempt,
      maxAttempts: j.maxAttempts,
      resultUrl: j.result?.url,
      assetId: j.assetId,
      updatedAt: Date.now()
    }));
    sessionStorage.setItem(STATUS_KEY, JSON.stringify(slim));
  } catch {
    /* ignore quota */
  }
}

function saveAssetMetadata(
  setData: (u: ProjectData | ((p: ProjectData) => ProjectData)) => void,
  asset: MediaAsset
): void {
  setData((d) => {
    // Avoid duplicates if retry somehow double-fires
    if (d.mediaAssets.some((a) => a.id === asset.id || a.fileUrl === asset.fileUrl)) {
      return d;
    }
    const next = { ...d, mediaAssets: [...d.mediaAssets, asset] };
    try {
      saveProject(next);
    } catch (err) {
      console.error('[upload] localStorage save failed', err);
      throw new Error(
        'File uploaded to cloud, but saving library metadata failed. Refresh and check Media Library.'
      );
    }
    return next;
  });
}

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const { setData } = useProject();
  const { success, error: toastError, info } = useToast();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const metaRef = useRef<Map<string, JobMeta>>(new Map());
  const runningRef = useRef<Set<string>>(new Set());

  const patchJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((list) => {
      const next = list.map((j) => (j.id === id ? { ...j, ...patch } : j));
      persistStatus(next);
      return next;
    });
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
      const next = list.filter((j) => j.id !== id);
      persistStatus(next);
      return next;
    });
    metaRef.current.delete(id);
    runningRef.current.delete(id);
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
      const next = list.filter((j) => isActivePhase(j.phase));
      // Drop meta for dismissed finished jobs
      list.forEach((j) => {
        if (!isActivePhase(j.phase)) metaRef.current.delete(j.id);
      });
      persistStatus(next);
      return next;
    });
  }, []);

  const runJob = useCallback(
    async (jobId: string) => {
      if (runningRef.current.has(jobId)) return;
      runningRef.current.add(jobId);

      const meta = metaRef.current.get(jobId);
      if (!meta) {
        patchJob(jobId, {
          phase: 'error',
          error: 'File is no longer available. Please choose the file again.',
          progress: 0,
          canRetry: false
        });
        runningRef.current.delete(jobId);
        return;
      }

      const { file, folder, kind, name, onComplete, onError } = meta;

      try {
        patchJob(jobId, {
          phase: 'uploading',
          progress: 1,
          error: undefined,
          canRetry: true,
          attempt: 1
        });

        const result = await uploadToBlob({
          file,
          folder,
          maxAttempts: UPLOAD_MAX_ATTEMPTS,
          onAttempt: (attempt, maxAttempts) => {
            patchJob(jobId, {
              attempt,
              maxAttempts,
              phase: attempt > 1 ? 'retrying' : 'uploading',
              progress: attempt > 1 ? 2 : 1
            });
          },
          onPhase: (phase) => {
            patchJob(jobId, {
              phase,
              ...(phase === 'processing' ? { progress: 92 } : {}),
              ...(phase === 'retrying' ? { progress: 2 } : {})
            });
          },
          onProgress: (pct) => patchJob(jobId, { progress: pct })
        });

        if (!result.url) {
          throw new Error('Upload completed without a file URL.');
        }

        let assetId: string | undefined;
        if (kind === 'library') {
          assetId = uid('ma');
          const title = result.name.replace(/\.[^.]+$/, '') || result.name;
          const asset: MediaAsset = {
            id: assetId,
            name: result.name,
            mime: result.contentType,
            size: result.size,
            fileUrl: result.url,
            pathname: result.pathname || undefined,
            notes: '',
            title,
            description: '',
            scheduledDate: '',
            status: 'draft',
            addedAt: new Date().toISOString(),
            assigneeId: null,
            assigneeName: null
          };

          // Local cache (device-specific) — cloud list is the real source of truth
          try {
            saveAssetMetadata(setData, asset);
          } catch (metaErr) {
            console.warn('[upload] localStorage cache failed', metaErr);
          }

          // Shared cloud metadata so all devices see titles / mime after upload
          if (result.pathname || result.url) {
            try {
              await saveMediaMeta({
                pathname: result.pathname,
                url: result.url,
                name: result.name,
                mime: result.contentType,
                title,
                description: '',
                notes: '',
                status: 'draft'
              });
            } catch (cloudMetaErr) {
              console.warn('[upload] cloud meta save failed', cloudMetaErr);
              // File is still in Blob; list() will show it without custom title
            }
          }

          notifyMediaLibraryChanged();
        }

        patchJob(jobId, {
          phase: 'complete',
          progress: 100,
          result,
          assetId,
          error: undefined,
          canRetry: false
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

        // Keep File until auto-dismiss in case user needs URL; then drop
        window.setTimeout(() => {
          metaRef.current.delete(jobId);
          dismissJob(jobId);
        }, 6000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        const canRetry = metaRef.current.has(jobId);
        patchJob(jobId, {
          phase: 'error',
          error: message,
          progress: 0,
          canRetry
        });
        toastError('Upload failed', canRetry ? `${message} — you can retry.` : message);
        try {
          onError?.(err instanceof Error ? err : new Error(message), jobId);
        } catch {
          /* ignore */
        }
      } finally {
        runningRef.current.delete(jobId);
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

      setJobs((list) => {
        const next: UploadJob[] = [
          ...list,
          {
            id,
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            progress: 0,
            phase: 'queued',
            previewUrl,
            folder,
            kind,
            attempt: 0,
            maxAttempts: UPLOAD_MAX_ATTEMPTS,
            canRetry: true
          }
        ];
        persistStatus(next);
        return next;
      });

      info('Upload started', `${file.name} · ${formatBytes(file.size)}`);
      void runJob(id);
      return id;
    },
    [info, runJob, toastError]
  );

  const retryJob = useCallback(
    (id: string) => {
      const meta = metaRef.current.get(id);
      if (!meta) {
        toastError('Cannot retry', 'Original file is no longer in memory. Please re-select it.');
        return;
      }
      if (runningRef.current.has(id)) return;
      patchJob(id, {
        phase: 'queued',
        progress: 0,
        error: undefined,
        attempt: 0
      });
      info('Retrying upload', meta.name);
      void runJob(id);
    },
    [info, patchJob, runJob, toastError]
  );

  const activeCount = jobs.filter((j) => isActivePhase(j.phase)).length;
  const hasActiveUploads = activeCount > 0;

  // Warn on tab close / refresh while uploading
  useEffect(() => {
    if (!hasActiveUploads) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        'Media uploads are still in progress. Leaving may cancel them. Are you sure?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasActiveUploads]);

  // Keep session status in sync
  useEffect(() => {
    persistStatus(jobs);
  }, [jobs]);

  const value = useMemo(
    () => ({
      jobs,
      activeCount,
      hasActiveUploads,
      startUpload,
      retryJob,
      dismissJob,
      clearFinished
    }),
    [jobs, activeCount, hasActiveUploads, startUpload, retryJob, dismissJob, clearFinished]
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
