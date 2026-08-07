import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { readResponseTextWithLimit } from '@/lib/public-network-url';

/**
 * /api/highlights/upload-frame
 * REQUIRES: Firebase Auth token in Authorization header.
 *
 * Proxy route: accepts a base64 JPEG frame from the browser and uploads it to
 * freeimage.host (free public image host, no account needed) to get a real HTTPS URL.
 *
 * Why this proxy?
 * - Straico vision API requires real HTTPS image URLs (not base64 data URIs)
 * - Firebase Storage direct browser upload is blocked by CORS from localhost
 * - This server-side proxy has no CORS restrictions (Node.js fetch vs browser XHR)
 * - freeimage.host is free, fast, and returns permanent HTTPS URLs suitable for AI analysis
 */

export const dynamic = 'force-dynamic';

/** Max payload: 5MB — a single JPEG frame should be well under this. */
const MAX_BODY_BYTES = 5_000_000;

// freeimage.host public API key (free tier, no signup required)
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || '6d207e02198a847aa98d0a2a901485a5';
const FREEIMAGE_ENDPOINT = 'https://freeimage.host/api/1/upload';

export async function POST(req: NextRequest) {
  // ── Auth guard: prevent anonymous use of our upload proxy ──────────────
  const authResult = await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const limited = await enforceUserRateLimit(authResult.uid, 'highlight-frame-upload', 300, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, MAX_BODY_BYTES);
    const base64 = body.base64;

    if (typeof base64 !== 'string' || !base64) {
      return NextResponse.json({ error: 'base64 image data required' }, { status: 400 });
    }
    const encoded = base64.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 4_800_000) {
      return NextResponse.json({ error: 'Frame must be a valid JPEG, PNG, or WebP base64 image.' }, { status: 400 });
    }

    // Upload to freeimage.host using their form-based API
    const formData = new FormData();
    formData.append('key', FREEIMAGE_API_KEY);
    formData.append('source', encoded);
    formData.append('type', 'base64');
    formData.append('format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const uploadRes = await fetch(FREEIMAGE_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!uploadRes.ok) {
      const errText = await readResponseTextWithLimit(uploadRes, 100_000);
      console.error('[Upload Frame] freeimage.host error:', uploadRes.status, errText.slice(0, 200));
      return NextResponse.json(
        { error: `Image host error: ${uploadRes.status}` },
        { status: 500 }
      );
    }

    const json = JSON.parse(await readResponseTextWithLimit(uploadRes, 100_000));
    const url = json?.image?.url;

    if (!url) {
      console.error('[Upload Frame] No URL in response:', JSON.stringify(json).slice(0, 300));
      return NextResponse.json({ error: 'Image host returned no URL' }, { status: 500 });
    }

    console.log('[Upload Frame] ✓ Uploaded frame to:', url);
    return NextResponse.json({ url });

  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Upload Frame Error]:', err.message);
    return NextResponse.json({ error: 'Frame upload failed.' }, { status: 502 });
  }
}
