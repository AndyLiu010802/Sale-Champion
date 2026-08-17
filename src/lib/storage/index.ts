import { LocalStorage } from './local';
import { S3Storage } from './s3';

export type StoredFile = { url: string };

export interface Storage {
  save(buf: Buffer, filename: string, contentType: string): Promise<StoredFile>;
}

export function getStorage(): Storage {
  return process.env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
}
