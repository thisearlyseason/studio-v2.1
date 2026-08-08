import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REVISION =
  process.env.K_REVISION ||
  process.env.GITHUB_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'unknown';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'the-squad-web',
      revision: REVISION,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
