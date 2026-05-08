export interface UploadResult {
  url: string
  pathname: string
  contentType: string
  size?: number
}

export interface StorageProvider {
  upload(
    filename: string,
    data: ArrayBuffer | Blob | ReadableStream,
    contentType: string,
  ): Promise<UploadResult>

  delete(url: string): Promise<void>

  getSignedUrl(url: string, expiresInSeconds?: number): Promise<string>
}
