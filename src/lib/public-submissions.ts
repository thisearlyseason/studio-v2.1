import { RequestBodyError } from '@/lib/server-request-guards';

const EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
const TYPES = new Set(['contact', 'newsletter', 'beta']);

function text(value: unknown, max: number, required = false): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new RequestBodyError('Missing required fields.', 400);
  if (result.length > max) throw new RequestBodyError('One or more fields are too long.', 400);
  return result;
}

function textList(value: unknown, maxItems: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) throw new RequestBodyError('Too many selections.', 400);
  return value.map(item => text(item, itemMax, true));
}

function email(value: unknown): string {
  const result = text(value, 254, true).toLowerCase();
  if (!EMAIL_PATTERN.test(result)) throw new RequestBodyError('Invalid email.', 400);
  return result;
}

export type PublicSubmission = {
  type: 'contact' | 'newsletter' | 'beta';
  values: Record<string, string | string[]>;
};

export function parsePublicSubmission(body: unknown): PublicSubmission {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestBodyError('Request body must be a JSON object.', 400);
  }
  const input = body as Record<string, unknown>;
  const type = text(input.type, 20, true).toLowerCase();
  if (!TYPES.has(type)) throw new RequestBodyError('Invalid submission type.', 400);

  if (type === 'newsletter') {
    return {
      type: 'newsletter',
      values: { name: text(input.name, 120), email: email(input.email) },
    };
  }

  if (type === 'contact') {
    return {
      type: 'contact',
      values: {
        name: text(input.name, 120, true),
        email: email(input.email),
        organization: text(input.organization, 160),
        inquiry: text(input.inquiry, 4_000, true),
      },
    };
  }

  const requiredFields: Array<[string, number]> = [
    ['fullName', 120], ['organization', 160], ['role', 80], ['sports', 240],
    ['scale', 160], ['currentTools', 240], ['frustrations', 2_000],
    ['mustHave', 2_000], ['whyBeta', 2_000], ['tested_before', 20],
    ['frequency', 40], ['address_street', 240], ['address_city', 120],
    ['address_state', 80], ['address_zip', 24],
  ];
  const values: Record<string, string | string[]> = { email: email(input.email) };
  for (const [field, max] of requiredFields) values[field] = text(input[field], max, true);
  if (!['yes', 'no'].includes(String(values.tested_before))) {
    throw new RequestBodyError('Invalid beta application fields.', 400);
  }
  values.phone = text(input.phone, 40);
  values.referral = text(input.referral, 240);
  values.socials = text(input.socials, 240);
  values.devices = textList(input.devices, 8, 40);
  values.features = textList(input.features, 20, 100);
  return { type: 'beta', values };
}
