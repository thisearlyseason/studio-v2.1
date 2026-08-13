import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'Reward Points have been retired. Use attendance confirmation for volunteer records.' },
    { status: 410 },
  );
}
