import fs from 'node:fs/promises';
import path from 'node:path';
import type { Storage, StoredFile } from './index';

export class LocalStorage implements Storage {
  private dir = path.join(process.cwd(), 'storage');

  async save(buf: Buffer, filename: string, _contentType: string): Promise<StoredFile> {
    await fs.mkdir(this.dir, { recursive: true });
    const ext = path.extname(filename).toLowerCase();
    const basename = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.dir, basename), buf);
    return { url: `/api/files/${basename}` };
  }
}
