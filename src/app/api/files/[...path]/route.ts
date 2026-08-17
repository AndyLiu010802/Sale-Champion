import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_TYPES } from '@/lib/storage';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  // basename 丢弃一切目录部分('..' 等),只允许命中 storage/ 下的直接子文件。
  const basename = path.basename(segments.join('/'));
  const filePath = path.join(process.cwd(), 'storage', basename);
  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const contentType = CONTENT_TYPES[path.extname(basename).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), {
    headers: { 'content-type': contentType, 'X-Content-Type-Options': 'nosniff' },
  });
}
