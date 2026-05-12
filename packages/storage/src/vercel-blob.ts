import { put, del } from '@vercel/blob'
import type { StorageProvider, UploadResult } from './provider.js'

export class VercelBlobProvider implements StorageProvider {
  async upload(
    filename: string,
    data: ArrayBuffer | Blob | ReadableStream,
    contentType: string,
  ): Promise<UploadResult> {
    const blob = await put(filename, data as Blob, {
      access: 'private',
      contentType,
    })
    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    }
  }

  async delete(url: string): Promise<void> {
    await del(url)
  }

  // Private blobs are only read server-side in the MVP.
  // Replace this with a signed download route before exposing document downloads.
  async getSignedUrl(url: string, _expiresInSeconds?: number): Promise<string> {
    return url
  }
}
