import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/floorplans/detect
 * AI vision (xAI / SpaceXAI) → walls, doors, windows in normalized coords.
 * Body: { imageBase64, mimeType?, canvasWidth, canvasHeight }
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'XAI_API_KEY is not configured. Local detection will be used.',
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

  // Guard payload size (~15MB base64 ~ 11MB binary)
  if (imageBase64.length > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Image too large for analysis. Try a smaller export.' },
      { status: 413 }
    );
  }

  const mime = body.mimeType?.startsWith('image/') ? body.mimeType : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${imageBase64}`;
  const model = process.env.XAI_VISION_MODEL?.trim() || 'grok-4.5';

  const prompt = `You are an architectural floor-plan analyzer. Look at this building floor plan image.
Detect major structural walls, doors, and windows.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "walls": [ { "x1": 0-1, "y1": 0-1, "x2": 0-1, "y2": 0-1, "thickness": 0.005-0.03 } ],
  "doors": [ { "x": 0-1, "y": 0-1, "width": 0.02-0.12, "height": 0.008-0.03, "rotation": 0 } ],
  "windows": [ { "x": 0-1, "y": 0-1, "width": 0.02-0.15, "height": 0.008-0.03, "rotation": 0 } ]
}

Coordinate system:
- Origin (0,0) is the TOP-LEFT of the image
- (1,1) is the BOTTOM-RIGHT
- All x/y/width/height values MUST be normalized 0–1 relative to the full image
- For walls, (x1,y1) and (x2,y2) are endpoints of the wall centerline
- Prefer axis-aligned walls (horizontal/vertical) when the plan is orthographic
- For doors/windows, (x,y) is the top-left of the opening rectangle; rotation in degrees
- Include only clear, major elements (not furniture, text, or dimension lines)
- thickness for walls is normalized stroke thickness (typical 0.008–0.02)
- If unsure about an element, omit it
- Return empty arrays if nothing clear is found`;

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: dataUrl,
                detail: 'high'
              },
              {
                type: 'input_text',
                text: prompt
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
      console.error('[api/floorplans/detect] xAI error', res.status, rawText.slice(0, 500));
      return NextResponse.json(
        {
          error: `Vision API error (${res.status}). Local detection will be used.`,
          useLocal: true,
          detail: typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: unknown }).error)
            : undefined
        },
        { status: 502 }
      );
    }

    const text = extractResponseText(payload);
    const parsed = parseArchitectureJson(text);
    if (!parsed) {
      console.warn('[api/floorplans/detect] could not parse JSON', text?.slice(0, 400));
      return NextResponse.json(
        {
          error: 'Could not parse AI response. Local detection will be used.',
          useLocal: true
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        method: 'ai',
        model,
        walls: parsed.walls || [],
        doors: parsed.doors || [],
        windows: parsed.windows || []
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[api/floorplans/detect]', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Detection failed',
        useLocal: true
      },
      { status: 500 }
    );
  }
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;

  if (typeof p.output_text === 'string') return p.output_text;

  // OpenAI-style responses API: output[].content[].text
  if (Array.isArray(p.output)) {
    const parts: string[] = [];
    for (const item of p.output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as { content?: unknown }).content;
      if (typeof content === 'string') parts.push(content);
      if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || typeof c !== 'object') continue;
          const t = (c as { text?: string; type?: string }).text;
          if (typeof t === 'string') parts.push(t);
        }
      }
    }
    if (parts.length) return parts.join('\n');
  }

  // chat completions fallback shape
  const choices = p.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const msg = (choices[0] as { message?: { content?: string } }).message;
    if (msg?.content) return msg.content;
  }

  return typeof p.raw === 'string' ? p.raw : JSON.stringify(payload);
}

function parseArchitectureJson(text: string): {
  walls?: unknown[];
  doors?: unknown[];
  windows?: unknown[];
} | null {
  if (!text) return null;
  let s = text.trim();
  // Strip markdown fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Find outermost JSON object
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
