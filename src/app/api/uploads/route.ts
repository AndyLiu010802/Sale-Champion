import path from 'node:path';
import { requireAdmin } from '@/lib/auth/session';
import { getStorage, CONTENT_TYPES } from '@/lib/storage';

const ALLOWED_EXTENSIONS = Object.keys(CONTENT_TYPES);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
// Multipart framing (boundary markers, field headers) adds overhead on top
// of the raw file bytes; 1MB of slack keeps the early Content-Length check
// from false-positiving on legitimate small-to-mid uploads.
const MAX_CONTENT_LENGTH_BYTES = MAX_SIZE_BYTES + 1024 * 1024;

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_CONTENT_LENGTH_BYTES) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file field' }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json({ error: `File type not allowed: ${ext || '(none)'}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  // Content type is derived from the (whitelisted) extension, never from the
  // client-supplied `file.type` — a client can set that field to anything.
  try {
    const stored = await getStorage().save(buf, file.name, CONTENT_TYPES[ext]);
    return Response.json({ data: { url: stored.url } });
  } catch (err) {
    console.error('[uploads] storage write failed:', err);
    return Response.json({ error: 'Failed to store file' }, { status: 500 });
  }
}
