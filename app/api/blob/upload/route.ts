import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { canEditProject, normalizeRole } from '@/lib/roles';

export const runtime = 'nodejs';
/** Allow large multipart finalization on Vercel */
export const maxDuration = 60;

/**
 * Client-upload token + completion webhook for Vercel Blob.
 * Only signed-in editors/admins may upload.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in again.' }, { status: 401 });
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
            'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel → Storage → Blob (or project env vars), then redeploy.'
        },
        { status: 503 }
      );
    }

    let body: HandleUploadBody;
    try {
      body = (await request.json()) as HandleUploadBody;
    } catch {
      return NextResponse.json({ error: 'Invalid upload request body.' }, { status: 400 });
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /*, clientPayload, multipart */) => {
        const allowed =
          pathname.startsWith('media/') ||
          pathname.startsWith('blitz/') ||
          pathname.startsWith('uploads/');

        if (!allowed) {
          throw new Error('Invalid upload path. Files must be under media/ or blitz/.');
        }

        // Broad allow-list so mobile HEIC / browser quirks do not fail silently.
        // Also accept common octet-stream when type inference is weak.
        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif',
            'image/avif',
            'image/*',
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'video/x-msvideo',
            'video/x-m4v',
            'video/mpeg',
            'video/*',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/octet-stream'
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId, pathname })
        };
      },
      // Keep this fast — hanging here can make client uploads appear stuck near completion.
      onUploadCompleted: async ({ blob }) => {
        console.log('[blob] upload completed', blob.pathname, blob.url);
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error('[api/blob/upload]', err);
    const message = err instanceof Error ? err.message : 'Upload authorization failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
