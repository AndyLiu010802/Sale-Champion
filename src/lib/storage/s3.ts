import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'node:path';
import type { Storage, StoredFile } from './index';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (required when STORAGE_DRIVER=s3)`);
  return value;
}

export class S3Storage implements Storage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const endpoint = requireEnv('R2_ENDPOINT');
    this.bucket = requireEnv('R2_BUCKET');
    this.publicBaseUrl = requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async save(buf: Buffer, filename: string, contentType: string): Promise<StoredFile> {
    const ext = path.extname(filename).toLowerCase();
    const key = `${crypto.randomUUID()}${ext}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }));
    return { url: `${this.publicBaseUrl}/${key}` };
  }
}
