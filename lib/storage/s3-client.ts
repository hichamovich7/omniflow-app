import { createHash, createHmac } from 'node:crypto';
import type { R2Config } from './config';

/**
 * Minimal S3 client for Cloudflare R2 (TASK-049): PutObject, GetObject,
 * DeleteObject and ListObjectsV2, path-style, signed with AWS Signature V4
 * over `fetch` + `node:crypto` — no SDK dependency. Errors carry the HTTP
 * status and the S3 error code only: never headers, signatures or keys.
 */

export interface S3ObjectClient {
  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  /** Every key under `prefix` (follows continuation tokens). */
  listObjects(prefix: string): Promise<string[]>;
}

export class S3RequestError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number | null,
    readonly s3Code: string | null
  ) {
    super(`R2 ${operation} failed${status !== null ? ` (HTTP ${status}${s3Code ? ` ${s3Code}` : ''})` : ' (network error)'}`);
    this.name = 'S3RequestError';
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

/** RFC 3986 encoding (encodeURIComponent leaves !'()* unescaped). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `/a/b c.png` → `/a/b%20c.png`, slashes kept. */
export function encodeKeyPath(key: string): string {
  return key.split('/').map(rfc3986).join('/');
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** `20130524T000000Z` */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Signs a request (AWS SigV4, service `s3`). Pure: returns the headers to
 * send, including `authorization`. `url` must already be encoded.
 */
export function signS3Request(params: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  credentials: Credentials;
  date: Date;
}): Record<string, string> {
  const timestamp = amzDate(params.date);
  const day = timestamp.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(params.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: params.url.host,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': timestamp,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalQuery = [...params.url.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonicalRequest = [
    params.method,
    params.url.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join('\n');

  const scope = `${day}/${params.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${params.credentials.secretAccessKey}`, day), params.region), 's3'),
    'aws4_request'
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${params.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function s3ErrorCode(xml: string): string | null {
  const match = /<Code>([^<]{1,100})<\/Code>/.exec(xml);
  return match ? match[1] : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function createR2S3Client(
  config: R2Config,
  options: { fetch?: FetchLike; now?: () => Date } = {}
): S3ObjectClient {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  const credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };

  async function send(
    operation: string,
    method: string,
    key: string | null,
    init: { query?: Record<string, string>; body?: Buffer; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const url = new URL(`${config.endpoint}/${rfc3986(config.bucket)}${key !== null ? `/${encodeKeyPath(key)}` : ''}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const headers = signS3Request({
      method,
      url,
      headers: init.headers ?? {},
      payloadHash: init.body ? sha256Hex(init.body) : EMPTY_SHA256,
      region: config.region,
      credentials,
      date: now(),
    });
    delete headers.host; // set by fetch from the URL

    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method,
        headers,
        ...(init.body ? { body: new Uint8Array(init.body) } : {}),
      });
    } catch {
      throw new S3RequestError(operation, null, null);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new S3RequestError(operation, response.status, s3ErrorCode(text));
    }
    return response;
  }

  return {
    async putObject({ key, body, contentType }) {
      await send('upload', 'PUT', key, { body, headers: { 'content-type': contentType } });
    },
    async getObject(key) {
      const response = await send('read', 'GET', key);
      return Buffer.from(await response.arrayBuffer());
    },
    async deleteObject(key) {
      await send('delete', 'DELETE', key);
    },
    async listObjects(prefix) {
      const keys: string[] = [];
      let token: string | null = null;
      do {
        const query: Record<string, string> = { 'list-type': '2', prefix };
        if (token) query['continuation-token'] = token;
        const xml = await (await send('list', 'GET', null, { query })).text();
        for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(decodeXml(match[1]));
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
        token = truncated && next ? decodeXml(next[1]) : null;
      } while (token);
      return keys;
    },
  };
}
