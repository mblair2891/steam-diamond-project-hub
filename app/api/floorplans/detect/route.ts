import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/floorplans/detect
 * OpenAI Vision → walls, doors, windows (normalized 0–1 coordinates).
 *
 * Server-only: uses OPENAI_API_KEY (never exposed to the browser).
 * Body: { imageBase64, mimeType?, canvasWidth?, canvasHeight? }
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'OPENAI_API_KEY is not configured. Add it to server environment variables. Local CV will be used as fallback.',
        useLocal: true
      },
      { status: 503 }
    );
  }

  let body: {
    imageBase64?: string;
    mimeType?: string;
    canvasWidth?: number;
    canvasHeight?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const imageBase64 = (body.imageBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!imageBase64 || imageBase64.length < 100) {
    return NextResponse.json({ error: 'imageBase64 is required.' }, { status: 400 });
  }

  // ~15MB base64 ≈ 11MB binary — OpenAI limit is lower; keep conservative
  if (imageBase64.length > 12 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Image too large for analysis. Try a smaller export.' },
      { status: 413 }
    );
  }

  const mime =
    body.mimeType === 'image/png' || body.mimeType === 'image/jpeg' || body.mimeType === 'image/webp'
      ? body.mimeType
      : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${imageBase64}`;
  const model = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o';

  const prompt = `You are an expert architectural floor-plan analyzer.
Analyze this building floor plan image and detect the major walls, doors, and windows.

Return ONLY valid JSON (no markdown, no code fences, no commentary) with this exact shape:
{
  "walls": [ { "x1": 0.0, "y1": 0.0, "x2": 1.0, "y2": 0.0, "thickness": 0.01 } ],
  "doors": [ { "x": 0.0, "y": 0.0, "width": 0.05, "height": 0.015, "rotation": 0 } ],
  "windows": [ { "x": 0.0, "y": 0.0, "width": 0.06, "height": 0.015, "rotation": 0 } ]
}

Coordinate system (required):
- Origin (0,0) = TOP-LEFT of the image
- (1,1) = BOTTOM-RIGHT of the image
- All coordinates and sizes are normalized floats between 0 and 1 inclusive
- Wall: (x1,y1) and (x2,y2) are endpoints of the wall centerline
- Prefer axis-aligned walls when the plan is orthographic
- Door/window: (x,y) is the top-left of the opening rectangle; width/height in normalized units; rotation in degrees (0 = horizontal opening along X)
- thickness for walls is a normalized stroke thickness (typical 0.006–0.02)
- Detect only major structural elements — ignore furniture, text labels, dimensions, grid lines, and hatching when possible
- Include exterior walls and major interior partitions
- If an element is uncertain, omit it rather than guessing wildly
- Use empty arrays [] when a category has no clear elements`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract architectural geometry from floor plan images and respond with JSON only.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ]
      })
    });

    const rawText = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { raw: rawText };
    }

    if (!res.ok) {
      const errMsg = extractOpenAiError(payload) || `OpenAI Vision error (${res.status})`;
      console.error('[api/floorplans/detect] OpenAI error', res.status, rawText.slice(0, 600));
      return NextResponse.json(
        {
          error: errMsg,
          useLocal: true,
          detail: errMsg
        },
        { status: res.status === 401 || res.status === 403 ? res.status : 502 }
      );
    }

    const text = extractChatContent(payload);
    const parsed = parseArchitectureJson(text);
    if (!parsed) {
      console.warn('[api/floorplans/detect] parse fail', text?.slice(0, 400));
      return NextResponse.json(
        {
          error: 'Could not parse OpenAI Vision response as architecture JSON.',
          useLocal: true
        },
        { status: 422 }
      );
    }

    const walls = Array.isArray(parsed.walls) ? parsed.walls : [];
    const doors = Array.isArray(parsed.doors) ? parsed.doors : [];
    const windows = Array.isArray(parsed.windows) ? parsed.windows : [];

    return NextResponse.json(
      {
        ok: true,
        method: 'openai-vision',
        model,
        walls,
        doors,
        windows,
        counts: {
          walls: walls.length,
          doors: doors.length,
          windows: windows.length
        }
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans/detect]', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'OpenAI Vision detection failed',
        useLocal: true
      },
      { status: 500 }
    );
  }
}

function extractOpenAiError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const err = (payload as { error?: { message?: string; code?: string } }).error;
  if (err?.message) return err.message;
  return null;
}

function extractChatContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    output_text?: string;
  };

  if (typeof p.output_text === 'string') return p.output_text;

  const content = p.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'object' && c && 'text' in c ? String(c.text || '') : ''))
      .join('\n');
  }
  return '';
}

function parseArchitectureJson(text: string): {
  walls?: unknown[];
  doors?: unknown[];
  windows?: unknown[];
} | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  s = s.slice(start, end + 1);

  try {
    const obj = JSON.parse(s) as {
      walls?: unknown[];
      doors?: unknown[];
      windows?: unknown[];
    };
    return {
      walls: Array.isArray(obj.walls) ? obj.walls : [],
      doors: Array.isArray(obj.doors) ? obj.doors : [],
      windows: Array.isArray(obj.windows) ? obj.windows : []
    };
  } catch {
    return null;
  }
}
