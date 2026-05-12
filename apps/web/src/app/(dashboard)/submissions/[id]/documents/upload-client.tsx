'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle, XCircle, Loader2, Play } from 'lucide-react'
import {
  isSupportedUploadFile,
  SUPPORTED_UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_LABEL,
} from '@/lib/document-file-types'

const DOC_TYPES = [
  { value: 'INVOICE', label: 'Fatura (Invoice)', description: 'Ticari fatura veya e-fatura' },
  { value: 'PACKING_LIST', label: 'Çeki Listesi (Packing List)', description: 'Paket ve ağırlık listesi' },
  { value: 'LOADING_INSTRUCTION', label: 'Yükleme Talimatı', description: 'Yükleme talimatı belgesi' },
  { value: 'TRANSPORT_DOC', label: 'Taşıma Belgesi', description: 'CMR, AWB, Konşimento vb.' },
  { value: 'DECLARATION_OUTPUT', label: 'Beyanname Çıktısı', description: 'BİLGE beyanname çıktısı' },
  { value: 'ORIGIN_DOC', label: 'Menşe Belgesi', description: 'EUR.1, A.TR, Form A vb.' },
  { value: 'PERMIT_DOC', label: 'İzin/Uygunluk Belgesi', description: 'Kontrol belgesi, izin belgesi' },
  { value: 'OTHER', label: 'Diğer', description: 'Destekleyici belge' },
] as const

interface ExistingDocument {
  id: string
  docType: string
  label: string
  status: string
  filename: string | null
}

interface Props {
  submissionId: string
  tradeFlow: string
  existingDocuments: ExistingDocument[]
}

interface UploadedDoc {
  id: string
  docType: string
  label: string
  filename: string
  status: string
}

export default function DocumentUploadClient({ submissionId, tradeFlow, existingDocuments }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedType, setSelectedType] = useState<string>('INVOICE')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<UploadedDoc[]>(
    existingDocuments.map((d) => ({
      id: d.id,
      docType: d.docType,
      label: d.label,
      filename: d.filename ?? 'Unknown',
      status: d.status,
    })),
  )
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadError(null)

    try {
      if (!isSupportedUploadFile(file.name, file.type)) {
        throw new Error('Desteklenmeyen dosya türü')
      }
      if (file.size > 20 * 1024 * 1024) throw new Error('File size must be under 20MB')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', selectedType)
      formData.append('label', DOC_TYPES.find((t) => t.value === selectedType)?.label ?? selectedType)

      const res = await fetch(`/api/submissions/${submissionId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Upload failed')
      }

      const data = await res.json() as UploadedDoc
      setDocuments((prev) => [...prev, data])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (uploading) return

    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  async function handleProcess() {
    setProcessing(true)
    setProcessError(null)

    try {
      const res = await fetch(`/api/submissions/${submissionId}/process`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Processing failed')
      }

      router.push(`/submissions/${submissionId}`)
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const docTypeLabels = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t.label]))

  return (
    <div className="max-w-3xl space-y-6">
      {/* Upload section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Belge Yükle</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Belge Türü</label>
          <div className="grid grid-cols-2 gap-2">
            {DOC_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setSelectedType(type.value)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  selectedType === type.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`font-medium ${selectedType === type.value ? 'text-blue-700' : 'text-gray-700'}`}>
                  {type.label}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{type.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!uploading) setDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!uploading) setDragging(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragging(false)
          }}
          onDrop={handleDrop}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          ) : (
            <Upload className="h-8 w-8 text-gray-400" />
          )}
          <p className="mt-2 text-sm font-medium text-gray-600">
            {uploading ? 'Yükleniyor...' : 'Belge dosyasını buraya sürükleyin veya tıklayın'}
          </p>
          <p className="mt-1 text-xs text-gray-400">{SUPPORTED_UPLOAD_LABEL}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_UPLOAD_ACCEPT}
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </div>

        {uploadError && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</div>
        )}
      </div>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Yüklenen Belgeler ({documents.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center px-6 py-4">
                <FileText className="h-5 w-5 text-gray-400" />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {docTypeLabels[doc.docType] ?? doc.docType}
                  </p>
                  <p className="text-xs text-gray-500">{doc.filename}</p>
                </div>
                <StatusIcon status={doc.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Process button */}
      {documents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Analizi Başlat</h3>
              <p className="mt-1 text-sm text-gray-500">
                {documents.length} belge yüklendi.{' '}
                {tradeFlow === 'IMPORT' && !documents.some((d) => d.docType === 'INVOICE') && (
                  <span className="text-yellow-600">Fatura eksik — yüklemeden devam edebilirsiniz.</span>
                )}
              </p>
            </div>
            <button
              onClick={handleProcess}
              disabled={processing}
              className="flex items-center rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {processing ? 'İşleniyor...' : 'Analizi Başlat'}
            </button>
          </div>

          {processError && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {processError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'DONE') return <CheckCircle className="h-5 w-5 text-green-500" />
  if (status === 'FAILED') return <XCircle className="h-5 w-5 text-red-500" />
  if (status === 'PROCESSING') return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
  return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
}
