import { NextResponse } from 'next/server';

/**
 * Legacy client-token endpoint — replaced by server-side put at /api/media/upload.
 * Kept so old clients get a clear message instead of hanging.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'This upload path is deprecated. Use POST /api/media/upload (server-side Vercel Blob).'
    },
    { status: 410 }
  );
}
