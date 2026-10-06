import { nativeAuthRequest } from '@/lib/native-auth/runtime';
export const runtime = 'nodejs';
export const POST = (request: Request) => nativeAuthRequest('start', request);
