import { LocalStorage } from './local';
import { S3Storage } from './s3';

export type StoredFile = { url: string };

export interface Storage {
  save(buf: Buffer, filename: string, contentType: string): Promise<StoredFile>;
}

// Server-derived extension → MIME mapping. Uploads and file-serving both use
// this as the single source of truth so the stored/served content type is
// never trusted from client-supplied input (e.g. multipart `file.type`).
export const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

export function getStorage(): Storage {
  return process.env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
}
