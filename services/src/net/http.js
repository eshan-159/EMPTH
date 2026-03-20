import { z } from 'zod';

const HttpErrorSchema = z.object({
  message: z.string(),
  status: z.number().optional(),
  body: z.any().optional()
});

export class HttpError extends Error {
  /** @param {{message: string, status?: number, body?: any}} params */
  constructor(params) {
    const parsed = HttpErrorSchema.parse(params);
    super(parsed.message);
    this.name = 'HttpError';
    this.status = parsed.status;
    this.body = parsed.body;
  }
}

/**
 * JSON request helper with consistent error handling.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, body?: any, timeoutMs?: number }} opts
 */
export async function httpJson(url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeoutMs = 60000 } = opts;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const finalHeaders = { ...headers };
    if (body !== undefined && !Object.keys(finalHeaders).some((k) => k.toLowerCase() === 'content-type')) {
      finalHeaders['content-type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

    if (!res.ok) {
      throw new HttpError({ message: `HTTP ${res.status} ${res.statusText}`, status: res.status, body: payload });
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * FormData helper for multipart endpoints.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, formData: FormData, timeoutMs?: number }} opts
 */
export async function httpFormData(url, opts) {
  const { method = 'POST', headers = {}, formData, timeoutMs = 60000 } = opts;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: formData,
      signal: controller.signal
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : await res.arrayBuffer().catch(() => null);

    if (!res.ok) {
      throw new HttpError({ message: `HTTP ${res.status} ${res.statusText}`, status: res.status, body: payload });
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
