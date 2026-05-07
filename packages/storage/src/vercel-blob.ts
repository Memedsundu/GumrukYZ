import { put, del } from '@vercel/blob'
import type { StorageProvider, UploadResult } from './provider.js'

export class VercelBlobProvider implements StorageProvider {
  async upload(
    filename: string,
    data: ArrayBuffer | Blob | ReadableStream,
    contentType: string,
  ): Promise<UploadResult> {
    const blob = await put(filename, data as Blob, {
      access: 'public',
      contentType,
    })
    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: blob.size,
    }
  }

  async delete(url: string): Promise<void> {
    await del(url)
  }

  // Vercel Blob doesn't require signed URLs for public blobs;
  // return the URL as-is for now. Replace with private blobs + signed URLs in Phase 4.
  async getSignedUrl(url: string, _expiresInSeconds?: number): Promise<string> {
    return url
  }
}
