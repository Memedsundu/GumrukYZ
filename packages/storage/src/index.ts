export type { StorageProvider, UploadResult } from './provider.js'
export { VercelBlobProvider } from './vercel-blob.js'

import { VercelBlobProvider } from './vercel-blob.js'

export function createStorageProvider(): VercelBlobProvider {
  // Phase 4: switch to AzureBlobProvider when AZURE_STORAGE_CONNECTION_STRING is set
  return new VercelBlobProvider()
}
