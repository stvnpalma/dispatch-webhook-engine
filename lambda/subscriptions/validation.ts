export type ValidationResult =
  | { ok: true; value: { eventType: string; url: string } }
  | { ok: false; error: string };

const EVENT_TYPE_MAX_LENGTH = 256;
const EVENT_TYPE_REGEX = /^[A-Za-z0-9._:-]+$/;

function isPrivateOrLoopbackIPv4(hostname: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (!match) return false;

  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[2], 10);

  if (p1 === 0 || p1 === 127) return true;
  if (p1 === 10) return true;
  if (p1 === 192 && p2 === 168) return true;
  if (p1 === 169 && p2 === 254) return true;
  if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;

  return false;
}

export function validateSubscription(input: unknown): ValidationResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const body = input as Record<string, unknown>;

  if (typeof body.eventType !== 'string') {
    return { ok: false, error: 'eventType must be a string.' };
  }

  const eventType = body.eventType.trim();
  if (eventType.length === 0 || eventType.length > EVENT_TYPE_MAX_LENGTH) {
    return {
      ok: false,
      error: `eventType must be between 1 and ${EVENT_TYPE_MAX_LENGTH} characters.`,
    };
  }

  if (!EVENT_TYPE_REGEX.test(eventType)) {
    return {
      ok: false,
      error: 'eventType contains characters unsafe for path parameters.',
    };
  }

  if (typeof body.url !== 'string') {
    return { ok: false, error: 'url must be a string.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return { ok: false, error: 'url is invalid or malformed.' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { ok: false, error: 'URL protocol must be https.' };
  }

  if (parsedUrl.username !== '' || parsedUrl.password !== '') {
    return { ok: false, error: 'URL must not contain embedded credentials.' };
  }

  if (parsedUrl.hostname.startsWith('[')) {
    return { ok: false, error: 'IPv6 addresses are not permitted.' };
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, '');

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return {
      ok: false,
      error: 'localhost and subdomain variants are not permitted.',
    };
  }

  if (isPrivateOrLoopbackIPv4(hostname)) {
    return {
      ok: false,
      error: 'Private or loopback IP addresses are not permitted.',
    };
  }

  return {
    ok: true,
    value: {
      eventType,
      url: parsedUrl.toString(),
    },
  };
}
