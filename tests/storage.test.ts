import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsonRequest } from './helpers/request';
import { sealSession, SESSION_COOKIE } from '@/lib/auth/session';
import { getStorage, CONTENT_TYPES } from '@/lib/storage';
import { POST as uploadsPost } from '@/app/api/uploads/route';
import { GET as filesGet } from '@/app/api/files/[...path]/route';

vi.mock('@aws-sdk/client-s3', () => {
  const S3Client = vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  }));
  const PutObjectCommand = vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input }));
  return { S3Client, PutObjectCommand };
});

const STORAGE_DIR = path.join(process.cwd(), 'storage');

afterAll(async () => {
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
});

function multipart(filename: string, bytes: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), filename);
  // 不手动设置 content-type,让 undici 自动带上 multipart boundary。
  return new Request('http://test.local/api/uploads', { method: 'POST', body: form, headers });
}

async function adminCookie(): Promise<Record<string, string>> {
  const seal = await sealSession({ userId: 'test-admin', email: 'admin@test.dev' });
  return { cookie: `${SESSION_COOKIE}=${seal}` };
}

describe('LocalStorage.save', () => {
  it('writes the file under <cwd>/storage and returns a /api/files url', async () => {
    const stored = await getStorage().save(Buffer.from('fake-png-bytes'), 'photo.png', 'image/png');
    expect(stored.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.png$/);
    const basename = stored.url.slice('/api/files/'.length);
    const onDisk = await fs.readFile(path.join(STORAGE_DIR, basename), 'utf8');
    expect(onDisk).toBe('fake-png-bytes');
  });
});

describe('POST /api/uploads', () => {
  it('returns 401 without an admin session', async () => {
    const res = await uploadsPost(multipart('photo.png', new Uint8Array([1, 2, 3])));
    expect(res.status).toBe(401);
  });

  it('rejects extensions outside the whitelist', async () => {
    const res = await uploadsPost(multipart('malware.exe', new Uint8Array([1]), await adminCookie()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('.exe');
  });

  it('rejects files over 10MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await uploadsPost(multipart('big.png', big, await adminCookie()));
    expect(res.status).toBe(400);
  });

  it('rejects oversized uploads early via content-length', async () => {
    const headers = { ...(await adminCookie()), 'content-length': '999999999' };
    const req = multipart('small.png', new Uint8Array([1, 2, 3]), headers);
    const res = await uploadsPost(req);
    expect(res.status).toBe(413);
  });

  it('stores an allowed file and returns { data: { url } }', async () => {
    const res = await uploadsPost(multipart('anthem.mp3', new Uint8Array([7, 7, 7]), await adminCookie()));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.mp3$/);
    const basename = data.url.slice('/api/files/'.length);
    await expect(fs.stat(path.join(STORAGE_DIR, basename))).resolves.toBeTruthy();
  });

  it('derives the stored content type from the extension, not the client-supplied type', async () => {
    // multipart() always sets the Blob's declared type to application/octet-stream,
    // regardless of filename — the client's claimed type must be ignored server-side.
    const res = await uploadsPost(multipart('anthem.mp3', new Uint8Array([7, 7, 7]), await adminCookie()));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const basename = data.url.slice('/api/files/'.length);
    const served = await filesGet(jsonRequest(`/api/files/${basename}`), {
      params: Promise.resolve({ path: [basename] }),
    });
    expect(served.headers.get('content-type')).toBe(CONTENT_TYPES['.mp3']);
    expect(served.headers.get('content-type')).not.toBe('application/octet-stream');
  });
});

describe('GET /api/files/[...path]', () => {
  it('serves an uploaded file with the mapped content-type', async () => {
    const stored = await getStorage().save(Buffer.from('imgdata'), 'pic.webp', 'image/webp');
    const basename = stored.url.slice('/api/files/'.length);
    const res = await filesGet(jsonRequest(`/api/files/${basename}`), {
      params: Promise.resolve({ path: [basename] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('imgdata');
  });

  it('returns 404 for a missing file', async () => {
    const res = await filesGet(jsonRequest('/api/files/nope.png'), {
      params: Promise.resolve({ path: ['nope.png'] }),
    });
    expect(res.status).toBe(404);
  });

  it('does not allow path traversal out of the storage dir', async () => {
    // 若实现直接 join 各段,这会命中项目根目录真实存在的 package.json;
    // 正确实现取 basename 后只会在 storage/ 下找 package.json → 404。
    const res = await filesGet(jsonRequest('/api/files/../../package.json'), {
      params: Promise.resolve({ path: ['..', '..', 'package.json'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('S3Storage (R2)', () => {
  const R2_ENV = {
    R2_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
    R2_BUCKET: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
  };

  it('throws naming the missing env var when R2_BUCKET is unset', async () => {
    try {
      vi.stubEnv('R2_ENDPOINT', R2_ENV.R2_ENDPOINT);
      vi.stubEnv('R2_BUCKET', '');
      vi.stubEnv('R2_PUBLIC_BASE_URL', R2_ENV.R2_PUBLIC_BASE_URL);
      vi.stubEnv('R2_ACCESS_KEY_ID', R2_ENV.R2_ACCESS_KEY_ID);
      vi.stubEnv('R2_SECRET_ACCESS_KEY', R2_ENV.R2_SECRET_ACCESS_KEY);
      const { S3Storage } = await import('@/lib/storage/s3');
      expect(() => new S3Storage()).toThrow('R2_BUCKET');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('save() sends a PutObjectCommand with the given content type and key extension, returning the public URL', async () => {
    try {
      vi.stubEnv('R2_ENDPOINT', R2_ENV.R2_ENDPOINT);
      vi.stubEnv('R2_BUCKET', R2_ENV.R2_BUCKET);
      vi.stubEnv('R2_PUBLIC_BASE_URL', R2_ENV.R2_PUBLIC_BASE_URL);
      vi.stubEnv('R2_ACCESS_KEY_ID', R2_ENV.R2_ACCESS_KEY_ID);
      vi.stubEnv('R2_SECRET_ACCESS_KEY', R2_ENV.R2_SECRET_ACCESS_KEY);
      const { S3Storage } = await import('@/lib/storage/s3');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const storage = new S3Storage();
      const result = await storage.save(Buffer.from('anthem-bytes'), 'anthem.mp3', 'audio/mpeg');

      // R2_PUBLIC_BASE_URL had a trailing slash; publicBaseUrl strips it, so
      // the returned url must have exactly one slash before the key.
      expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/[0-9a-f-]{36}\.mp3$/);

      const call = vi.mocked(PutObjectCommand).mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
      expect(call?.Bucket).toBe('test-bucket');
      expect(call?.ContentType).toBe('audio/mpeg');
      expect(String(call?.Key)).toMatch(/^[0-9a-f-]{36}\.mp3$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
