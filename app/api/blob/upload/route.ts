import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { canEditProject, normalizeRole } from '@/lib/roles';
import { currentUser } from '@clerk/nextjs/server';

/**
 * Client-upload token endpoint for Vercel Blob.
 * Only signed-in editors/admins may upload.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  const role = normalizeRole(user?.publicMetadata?.role ?? user?.unsafeMetadata?.role);
  if (!canEditProject(role)) {
    return NextResponse.json({ error: 'Editors and admins only' }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN to your environment (Vercel Storage → Blob).'
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Restrict to media paths and common media types
        const allowed =
          pathname.startsWith('media/') ||
          pathname.startsWith('blitz/') ||
          pathname.startsWith('uploads/');

        if (!allowed) {
          throw new Error('Invalid upload path');
        }

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif',
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'video/x-msvideo',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          tokenPayload: JSON.stringify({ userId })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[blob] upload completed', blob.url, tokenPayload);
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error('[api/blob/upload]', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
