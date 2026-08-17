import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsonRequest } from './helpers/request';
import { sealSession, SESSION_COOKIE } from '@/lib/auth/session';
import { getStorage } from '@/lib/storage';
import { POST as uploadsPost } from '@/app/api/uploads/route';
import { GET as filesGet } from '@/app/api/files/[...path]/route';

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

  it('stores an allowed file and returns { data: { url } }', async () => {
    const res = await uploadsPost(multipart('anthem.mp3', new Uint8Array([7, 7, 7]), await adminCookie()));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.mp3$/);
    const basename = data.url.slice('/api/files/'.length);
    await expect(fs.stat(path.join(STORAGE_DIR, basename))).resolves.toBeTruthy();
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
