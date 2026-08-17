import path from 'node:path';
import { requireAdmin } from '@/lib/auth/session';
import { getStorage } from '@/lib/storage';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.ogg'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;

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
  const stored = await getStorage().save(buf, file.name, file.type || 'application/octet-stream');
  return Response.json({ data: { url: stored.url } });
}
