import * as crypto from 'crypto';

export type ParseResult =
  { ok: true; key: string | undefined } | { ok: false; error: string };

export function parseIdempotencyKey(header: string | undefined): ParseResult {
  if (header === undefined) return { ok: true, key: undefined };

  if (typeof header !== 'string' || header === '') {
    return { ok: false, error: 'cannot be a empty string, or have whitespace' };
  }
  if (header.length > 128) return { ok: false, error: 'Key is too long' };
  if (/\s/.test(header)) return { ok: false, error: 'contains whitespace ' };
  if (!/^[A-Za-z0-9._:-]+$/.test(header))
    return { ok: false, error: 'Invalid characters' };

  return { ok: true, key: header };
}

export function deriveEventId(sub: string, key: string): string {
  return crypto.createHash('sha256').update(`${sub}:${key}`).digest('hex');
}
