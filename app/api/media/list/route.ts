import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { buildLibraryAssets } from '@/lib/media-library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/list
 * Lists Media Library files from Vercel Blob (synced across all devices).
 * Clerk session required.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error:
          'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN and redeploy.',
        assets: [],
        total: 0
      },
      { status: 503 }
    );
  }

  try {
    const { assets, total, metaUpdatedAt } = await buildLibraryAssets();
    return NextResponse.json(
      {
        ok: true,
        assets,
        total,
        metaUpdatedAt,
        source: 'vercel-blob',
        fetchedAt: new Date().toISOString()
      },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (err) {
    console.error('[api/media/list]', err);
    const message = err instanceof Error ? err.message : 'Failed to list media';
    return NextResponse.json({ error: message, assets: [], total: 0 }, { status: 500 });
  }
}
