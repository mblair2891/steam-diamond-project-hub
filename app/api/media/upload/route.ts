import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { canEditProject, normalizeRole } from '@/lib/roles';

export const runtime = 'nodejs';
/** Large files + Blob put can take a while on cold starts */
export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024; // 100MB
const MULTIPART_THRESHOLD = 4 * 1024 * 1024;

const ALLOWED_FOLDERS = new Set(['media', 'blitz', 'uploads']);

function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return base || 'file';
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function inferContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return map[extOf(file.name)] || file.type || 'application/octet-stream';
}

function isAllowedMime(mime: string, name: string): boolean {
  if (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/octet-stream'
  ) {
    return true;
  }
  // Fallback: extension-based allow for empty/odd browser MIME
  return Boolean(
    extOf(name).match(
      /\.(jpe?g|png|gif|webp|heic|heif|avif|mp4|mov|webm|avi|m4v|pdf|docx?)$/i
    )
  );
}

/**
 * POST /api/media/upload
 * multipart/form-data:
 *   - file: File (required)
 *   - folder: "media" | "blitz" | "uploads" (optional, default media)
 *
 * Server-side put() via official @vercel/blob.
 * Uses access: 'private' to match private Blob stores.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in again.' },
        { status: 401 }
      );
    }

    const user = await currentUser();
    const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
    if (!canEditProject(role)) {
      return NextResponse.json(
        { error: 'Editors and admins only. Contact an admin for upload access.' },
        { status: 403 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      return NextResponse.json(
        {
          error:
            'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel → Project → Storage / Environment Variables, then redeploy.'
        },
        { status: 503 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.error('[api/media/upload] formData parse failed', err);
      return NextResponse.json(
        {
          error:
            'Could not read the upload body. The file may be too large for this deployment, or the request was interrupted. Try a smaller file or check Vercel body size limits.'
        },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file. Send multipart field "file".' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / (1024 * 1024)}MB).` },
        { status: 400 }
      );
    }

    const folderRaw = String(formData.get('folder') || 'media')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'media';

    const contentType = inferContentType(file);
    if (!isAllowedMime(contentType, file.name)) {
      return NextResponse.json(
        {
          error: `Unsupported file type (${contentType || 'unknown'}). Use images, videos, or PDF.`
        },
        { status: 400 }
      );
    }

    const pathname = `${folder}/${Date.now()}-${safeName(file.name)}`;
    const useMultipart = file.size >= MULTIPART_THRESHOLD;

    // Private store: access must be 'private' (public access throws on private stores)
    let blob;
    try {
      blob = await put(pathname, file, {
        access: 'private',
        contentType,
        addRandomSuffix: true,
        multipart: useMultipart,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
    } catch (putErr) {
      console.error('[api/media/upload] put failed', putErr);
      const raw = putErr instanceof Error ? putErr.message : String(putErr);
      if (/Cannot use public access on a private store/i.test(raw)) {
        return NextResponse.json(
          {
            error:
              'Blob store is private. This app must upload with access: "private". Redeploy the latest code.'
          },
          { status: 500 }
        );
      }
      // 503 so the client retry logic treats Blob outages as retryable
      const retryable = /fetch failed|ECONNRESET|timeout|ETIMEDOUT|rate|503|502|temporarily/i.test(
        raw
      );
      return NextResponse.json(
        {
          error: /BLOB_READ_WRITE_TOKEN|No token/i.test(raw)
            ? 'Vercel Blob token missing or invalid. Set BLOB_READ_WRITE_TOKEN and redeploy.'
            : raw || 'Failed to store file in Vercel Blob. Please try again.'
        },
        { status: retryable ? 503 : 500 }
      );
    }

    if (!blob?.url) {
      console.error('[api/media/upload] put returned no url', blob);
      return NextResponse.json(
        { error: 'Blob storage returned no URL. Please try again.' },
        { status: 502 }
      );
    }

    // Private blobs cannot be loaded via raw URL in <img>/<video>; clients use this proxy path.
    const viewUrl = `/api/media/file?pathname=${encodeURIComponent(blob.pathname)}`;

    return NextResponse.json(
      {
        ok: true,
        access: 'private',
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType || contentType,
        size: file.size,
        name: file.name,
        downloadUrl: blob.downloadUrl || blob.url,
        viewUrl
      },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (err) {
    console.error('[api/media/upload]', err);
    const raw = err instanceof Error ? err.message : String(err);

    // Surface common Blob / platform errors clearly
    let message = raw || 'Upload failed on the server.';
    let status = 500;
    if (/BLOB_READ_WRITE_TOKEN|No token/i.test(raw)) {
      message =
        'Vercel Blob token missing or invalid. Set BLOB_READ_WRITE_TOKEN and redeploy.';
      status = 503;
    } else if (/payload|body.*too large|Entity Too Large|413/i.test(raw)) {
      message =
        'File is too large for this server request. Try a smaller file, or raise the deployment body size limit.';
      status = 413;
    } else if (/fetch failed|ECONNRESET|timeout|ETIMEDOUT/i.test(raw)) {
      message = 'Network error while saving to Vercel Blob. Please try again.';
      status = 503;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
