import { appleDeletionRequest } from '@/lib/apple-deletion/runtime';
export const runtime = 'nodejs';
export const POST = (request: Request) => appleDeletionRequest('challenge', request);
