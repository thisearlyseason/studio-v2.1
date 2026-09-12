import { APP_DISTRIBUTION } from '@/lib/app-distribution';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { distribution: APP_DISTRIBUTION },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
