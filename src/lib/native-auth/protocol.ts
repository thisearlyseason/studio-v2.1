import { z } from 'zod';

export type NativeAuthErrorCode = 'invalid_request' | 'invalid_attempt' | 'invalid_identity' | 'account_unavailable' | 'onboarding_required' | 'unavailable' | 'rate_limited';
export class NativeAuthError extends Error {
  constructor(readonly code: NativeAuthErrorCode) {
    super(code);
    this.name = 'NativeAuthError';
  }
}

/** A canonical 32-byte value, without padding or alternate final sextets. */
export function isSecret(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    return decoded.length === 32 && btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === value;
  } catch { return false; }
}

const secretSchema = z.string().refine(isSecret);
const providerSchema = z.enum(['google.com', 'apple.com']);
const version = z.literal(1);
const requestId = z.string().uuid();
export const onboardingSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(['adult_player', 'parent', 'coach', 'admin', 'league_creator']),
  adultConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  joinCode: z.string().max(128),
}).strict();
const beginSchema = z.object({ version, type: z.literal('begin'), requestId, provider: providerSchema, webChallenge: secretSchema }).strict();
const cancelSchema = z.object({ version, type: z.literal('cancel'), requestId }).strict();
const startSchema = z.object({ version, provider: providerSchema, webChallenge: secretSchema, nativeChallenge: secretSchema }).strict();
const completeSchema = z.object({ version, handle: secretSchema, nativeSecret: secretSchema }).strict();
const redeemSchema = z.object({ version, handle: secretSchema, webVerifier: secretSchema, onboarding: onboardingSchema.optional() }).strict();
const replySchema = z.union([
  z.object({ version, type: z.literal('ready'), requestId, handle: secretSchema, needsOnboarding: z.boolean() }).strict(),
  z.object({ version, type: z.enum(['cancelled', 'failed']), requestId }).strict(),
]);

// JSON cannot contain custom prototypes, symbol keys, accessors, or cycles.
function plainJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value !== 'object') return ['string', 'number', 'boolean'].includes(typeof value) || value === null;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && 'value' in descriptor && plainJson(descriptor.value, depth + 1);
  });
}

export function parseNativeValue<T>(schema: z.ZodType<T>, input: unknown): T {
  if (!plainJson(input)) throw new NativeAuthError('invalid_request');
  const result = schema.safeParse(input);
  if (!result.success) throw new NativeAuthError('invalid_request');
  return result.data;
}

export type Provider = z.infer<typeof providerSchema>;
export type Begin = z.infer<typeof beginSchema>;
export type Cancel = z.infer<typeof cancelSchema>;
export type Start = z.infer<typeof startSchema>;
export type Complete = z.infer<typeof completeSchema>;
export type Redeem = z.infer<typeof redeemSchema>;
export type NativeOnboarding = z.infer<typeof onboardingSchema>;
export type NativeReply = z.infer<typeof replySchema>;
export type Ready = Extract<NativeReply, { type: 'ready' }>;
export const parseBegin = (input: unknown): Begin => parseNativeValue(beginSchema, input);
export const parseCancel = (input: unknown): Cancel => parseNativeValue(cancelSchema, input);
export const parseStart = (input: unknown): Start => parseNativeValue(startSchema, input);
export const parseComplete = (input: unknown): Complete => parseNativeValue(completeSchema, input);
export const parseRedeem = (input: unknown): Redeem => parseNativeValue(redeemSchema, input);
export const parseReply = (input: unknown): NativeReply => parseNativeValue(replySchema, input);
