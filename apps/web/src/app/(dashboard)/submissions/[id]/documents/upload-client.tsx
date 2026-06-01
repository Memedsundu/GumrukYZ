'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle, XCircle, Loader2, Play, SearchCheck } from 'lucide-react'
import {
  isSupportedUploadFile,
  SUPPORTED_UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_LABEL,
} from '@/lib/document-file-types'

const DOC_TYPES = [
  { value: 'INVOICE', label: 'Fatura' },
  { value: 'PACKING_LIST', label: 'Çeki listesi' },
  { value: 'LOADING_INSTRUCTION', label: 'Yükleme talimatı' },
  { value: 'TRANSPORT_DOC', label: 'Taşıma belgesi' },
  { value: 'DECLARATION_OUTPUT', label: 'Beyanname çıktısı' },
  { value: 'ORIGIN_DOC', label: 'Menşe belgesi' },
  { value: 'PERMIT_DOC', label: 'İzin/uygunluk belgesi' },
  { value: 'OTHER', label: 'Diğer' },
] as const

interface ExistingDocument {
  id: string
  docType: string
  suggestedDocType: string | null
  suggestedDocTypeConfidence: number | null
  classificationReasoning: string | null
  classificationSourceRefs: Array<{ field: string; value: string }>
  classificationValidatedAt: string | null
  isIgnored: boolean
  status: string
  filename: string | null
}

interface Props {
  submissionId: string
  tradeFlow: string
  classificationStatus: string
  existingDocuments: ExistingDocument[]
}

interface UploadedDoc {
  id: string
  docType: string
  suggestedDocType: string | null
  suggestedDocTypeConfidence: number | null
  classificationReasoning: string | null
  classificationSourceRefs: Array<{ field: string; value: string }>
  classificationValidatedAt: string | null
  isIgnored: boolean
  filename: string
  status: string
}

type ClientMatch = {
  id: string
  displayName: string
  taxId: string | null
  address: string | null
  country: string | null
  matchType: string
  confidence: number
}

type Party = {
  role: string
  name: string | null
  taxId?: string | null
  address?: string | null
  country?: string | null
}

type ClassificationResponse = {
  submission: {
    suggestedTradeFlow: string
    suggestedTradeFlowConfidence: number
    classificationStatus: string
  }
  documents: Array<{
    id: string
    suggestedDocType: string
    confidence: number
    reasoning: string
    sourceRefs: Array<{ field: string; value: string }>
    parties: Party[]
  }>
  clientMatches: ClientMatch[]
}

type ProcessingProgressState = {
  percent: number
  label: string
  description: string
}

export default function DocumentUploadClient({
  submissionId,
  tradeFlow,
  classificationStatus: initialClassificationStatus,
  existingDocuments,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<UploadedDoc[]>(
    existingDocuments.map((d) => ({
      ...d,
      filename: d.filename ?? 'Bilinmeyen dosya',
    })),
  )
  const [classificationStatus, setClassificationStatus] = useState(initialClassificationStatus)
  const [tradeFlowChoice, setTradeFlowChoice] = useState(tradeFlow === 'IMPORT' || tradeFlow === 'EXPORT' ? tradeFlow : '')
  const [classifying, setClassifying] = useState(false)
  const [classificationError, setClassificationError] = useState<string | null>(null)
  const [clientMatches, setClientMatches] = useState<ClientMatch[]>([])
  const [clientAction, setClientAction] = useState<'none' | 'existing' | 'create'>('none')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [newClient, setNewClient] = useState({ displayName: '', taxId: '', address: '', country: '' })
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgressState | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)

  const needsValidation = documents.length > 0 && (
    classificationStatus !== 'VALIDATED' ||
    !tradeFlowChoice ||
    documents.some((doc) => !doc.isIgnored && doc.docType === 'UNCLASSIFIED')
  )
  const canProcess = documents.length > 0 && !needsValidation
  const nextAction = getNextAction({
    documentCount: documents.length,
    classificationStatus,
    needsValidation,
    canProcess,
    classifying,
    validating,
    processing,
  })

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadError(null)

    try {
      if (!isSupportedUploadFile(file.name, file.type)) throw new Error('Desteklenmeyen dosya türü')
      if (file.size > 20 * 1024 * 1024) throw new Error('Dosya boyutu 20MB altında olmalı')

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/submissions/${submissionId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Yükleme başarısız')
      }

      const data = await res.json() as UploadedDoc
      setDocuments((prev) => [
        ...prev,
        {
          ...data,
          docType: 'UNCLASSIFIED',
          suggestedDocType: null,
          suggestedDocTypeConfidence: null,
          classificationReasoning: null,
          classificationSourceRefs: [],
          classificationValidatedAt: null,
          isIgnored: false,
        },
      ])
      setClassificationStatus('PENDING')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Yükleme başarısız')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    for (const file of files) {
      await uploadFile(file)
    }
    if (files.length > 0) await handleClassify()
  }

  async function handleClassify() {
    setClassifying(true)
    setClassificationError(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/classify`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Sınıflandırma başarısız')
      }
      const data = await res.json() as ClassificationResponse
      setClassificationStatus(data.submission.classificationStatus)
      if (data.submission.suggestedTradeFlow === 'IMPORT' || data.submission.suggestedTradeFlow === 'EXPORT') {
        setTradeFlowChoice(data.submission.suggestedTradeFlow)
      }
      setClientMatches(data.clientMatches)
      if (data.clientMatches[0]) {
        setClientAction('existing')
        setSelectedClientId(data.clientMatches[0].id)
      }

      const firstParty = data.documents.flatMap((doc) => doc.parties).find((party) => party.name)
      if (!data.clientMatches[0] && firstParty?.name) {
        setClientAction('create')
        setNewClient({
          displayName: firstParty.name,
          taxId: firstParty.taxId ?? '',
          address: firstParty.address ?? '',
          country: firstParty.country ?? '',
        })
      }

      setDocuments((prev) => prev.map((doc) => {
        const suggestion = data.documents.find((item) => item.id === doc.id)
        if (!suggestion) return doc
        return {
          ...doc,
          docType: suggestion.suggestedDocType,
          suggestedDocType: suggestion.suggestedDocType,
          suggestedDocTypeConfidence: suggestion.confidence,
          classificationReasoning: suggestion.reasoning,
          classificationSourceRefs: suggestion.sourceRefs,
        }
      }))
    } catch (err) {
      setClassificationError(err instanceof Error ? err.message : 'Sınıflandırma başarısız')
    } finally {
      setClassifying(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    setValidationError(null)
    try {
      if (tradeFlowChoice !== 'IMPORT' && tradeFlowChoice !== 'EXPORT') {
        throw new Error('İthalat/ihracat yönünü seçin')
      }
      if (documents.some((doc) => !doc.isIgnored && doc.docType === 'UNCLASSIFIED')) {
        throw new Error('Yoksayılmayan her belge için belge türünü doğrulayın')
      }

      const client = clientAction === 'existing'
        ? { action: 'existing', brokerClientId: selectedClientId }
        : clientAction === 'create'
          ? {
              action: 'create',
              displayName: newClient.displayName,
              taxId: newClient.taxId || null,
              address: newClient.address || null,
              country: newClient.country || null,
            }
          : { action: 'none' }

      const res = await fetch(`/api/submissions/${submissionId}/classification`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeFlow: tradeFlowChoice,
          documents: documents.map((doc) => ({
            id: doc.id,
            docType: doc.isIgnored && doc.docType === 'UNCLASSIFIED' ? 'OTHER' : doc.docType,
            isIgnored: doc.isIgnored,
          })),
          client,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Doğrulama kaydedilemedi')
      }

      setClassificationStatus('VALIDATED')
      setDocuments((prev) => prev.map((doc) => ({
        ...doc,
        classificationValidatedAt: new Date().toISOString(),
      })))
      router.refresh()
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Doğrulama kaydedilemedi')
    } finally {
      setValidating(false)
    }
  }

  async function pollSubmissionStatus(): Promise<void> {
    const maxAttempts = 120
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(`/api/submissions/${submissionId}/status`)
      if (!res.ok) {
        throw new Error('İşlem durumu alınamadı')
      }
      const data = await res.json() as {
        status: string
        progressPercent?: number
        progressLabel?: string
        progressDescription?: string
        job?: { errorMessage?: string | null }
      }
      setProcessingProgress({
        percent: data.progressPercent ?? 0,
        label: data.progressLabel ?? 'İşlem sürüyor',
        description: data.progressDescription ?? 'Tahmini ilerleme alınıyor.',
      })
      if (data.status === 'COMPLETED') {
        setProcessingProgress({
          percent: 100,
          label: 'Tamamlandı',
          description: 'Analiz tamamlandı; dosya sayfası açılıyor.',
        })
        router.push(`/submissions/${submissionId}`)
        return
      }
      if (data.status === 'FAILED') {
        throw new Error(data.job?.errorMessage ?? 'İşleme başarısız')
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    throw new Error('İşlem zaman aşımına uğradı. Lütfen dosya detayından durumu kontrol edin.')
  }

  async function handleProcess() {
    setProcessing(true)
    setProcessError(null)
    setProcessingProgress({
      percent: 8,
      label: 'Analiz başlatılıyor',
      description: 'İş kuyruğu hazırlanıyor. İlerleme tahmini olarak gösterilir.',
    })

    try {
      const res = await fetch(`/api/submissions/${submissionId}/process`, { method: 'POST' })
      const data = await res.json() as { error?: string; async?: boolean }
      if (!res.ok) {
        throw new Error(data.error ?? 'İşleme başarısız')
      }
      if (res.status === 202 || data.async) {
        await pollSubmissionStatus()
        return
      }
      setProcessingProgress({
        percent: 100,
        label: 'Tamamlandı',
        description: 'Analiz tamamlandı; dosya sayfası açılıyor.',
      })
      router.push(`/submissions/${submissionId}`)
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'İşleme başarısız')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Sıradaki adım</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900">{nextAction.title}</h2>
            <p className="mt-1 text-sm text-gray-700">{nextAction.description}</p>
            {nextAction.blockingReasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-blue-900">
                {nextAction.blockingReasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => {
              if (nextAction.action === 'upload') fileInputRef.current?.click()
              if (nextAction.action === 'classify') void handleClassify()
              if (nextAction.action === 'validate') void handleValidate()
              if (nextAction.action === 'process') void handleProcess()
            }}
            disabled={nextAction.disabled}
            className="inline-flex shrink-0 items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {nextAction.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            {nextAction.cta}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Belgeleri Yükle</h2>
        <div
          className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
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
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragging(false)
            void uploadFiles(e.dataTransfer.files)
          }}
        >
          {uploading ? <Loader2 className="h-8 w-8 animate-spin text-blue-500" /> : <Upload className="h-8 w-8 text-gray-400" />}
          <p className="mt-2 text-sm font-medium text-gray-600">
            {uploading ? 'Yükleniyor...' : 'Dosyaları yükleyin; belge türünü sistem önerecek'}
          </p>
          <p className="mt-1 text-xs text-gray-400">{SUPPORTED_UPLOAD_LABEL}</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void uploadFiles(e.target.files)
            }}
            disabled={uploading}
          />
        </div>
        {uploadError && <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</div>}
      </div>

      {documents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Yüklenen Belgeler ({documents.length})</h2>
            <button
              onClick={handleClassify}
              disabled={classifying}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {classifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
              {classifying ? 'Okunuyor...' : 'Tekrar oku ve sınıflandır'}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {documents.map((doc) => (
              <div key={doc.id} className="px-6 py-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{doc.filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {doc.suggestedDocType && (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Öneri: {docTypeLabel(doc.suggestedDocType)}
                        </span>
                      )}
                      {doc.suggestedDocTypeConfidence != null && (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceClass(doc.suggestedDocTypeConfidence)}`}>
                          Güven %{Math.round(doc.suggestedDocTypeConfidence * 100)}
                        </span>
                      )}
                    </div>
                    {doc.classificationReasoning && (
                      <p className="mt-1 text-xs text-gray-500">{doc.classificationReasoning}</p>
                    )}
                    {doc.classificationSourceRefs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {doc.classificationSourceRefs.slice(0, 4).map((ref, i) => (
                          <span key={`${ref.field}-${i}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {ref.field}: {ref.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={doc.docType === 'UNCLASSIFIED' ? '' : doc.docType}
                    onChange={(e) => setDocuments((prev) => prev.map((item) => item.id === doc.id ? { ...item, docType: e.target.value } : item))}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">Belge türü seçin</option>
                    {DOC_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={doc.isIgnored}
                      onChange={(e) => setDocuments((prev) => prev.map((item) => item.id === doc.id ? { ...item, isIgnored: e.target.checked } : item))}
                    />
                    Yoksay
                  </label>
                  <StatusIcon status={doc.status} validated={Boolean(doc.classificationValidatedAt)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {classificationError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{classificationError}</div>}

      {documents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900">Kullanıcı Doğrulaması</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">İşlem yönü</label>
              <select
                value={tradeFlowChoice}
                onChange={(e) => setTradeFlowChoice(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Seçin</option>
                <option value="IMPORT">İthalat</option>
                <option value="EXPORT">İhracat</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Müşteri eşleştirme</label>
              <select
                value={clientAction === 'existing' ? selectedClientId : clientAction}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === 'none' || value === 'create') {
                    setClientAction(value)
                    setSelectedClientId('')
                  } else {
                    setClientAction('existing')
                    setSelectedClientId(value)
                  }
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="none">Müşteri bağlama</option>
                {clientMatches.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName} (%{Math.round(client.confidence * 100)})
                  </option>
                ))}
                <option value="create">Yeni müşteri kaydı oluştur</option>
              </select>
              {clientMatches[0] && (
                <p className="mt-1 text-xs text-gray-500">
                  En güçlü eşleşme: {clientMatches[0].displayName} · {clientMatchLabel(clientMatches[0].matchType)} · güven %{Math.round(clientMatches[0].confidence * 100)}
                </p>
              )}
            </div>
          </div>

          {clientAction === 'create' && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={newClient.displayName}
                onChange={(e) => setNewClient((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="Müşteri adı"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={newClient.taxId}
                onChange={(e) => setNewClient((prev) => ({ ...prev, taxId: e.target.value }))}
                placeholder="Vergi numarası"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={newClient.address}
                onChange={(e) => setNewClient((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Adres"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={newClient.country}
                onChange={(e) => setNewClient((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="Ülke"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {needsValidation ? 'Önerileri kontrol edip doğruladıktan sonra analiz başlatılabilir.' : 'Sınıflandırma doğrulandı.'}
            </p>
            <button
              onClick={handleValidate}
              disabled={validating}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Doğrulamayı kaydet
            </button>
          </div>
          {validationError && <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{validationError}</div>}
        </div>
      )}

      {documents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Analizi Başlat</h3>
              <p className="mt-1 text-sm text-gray-500">
                {canProcess ? `${documents.length} belge doğrulandı.` : 'Önce sınıflandırmayı doğrulayın.'}
              </p>
            </div>
            <button
              onClick={handleProcess}
              disabled={processing || !canProcess}
              className="flex items-center rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {processing ? 'İşleniyor...' : 'Analizi Başlat'}
            </button>
          </div>
          {processError && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{processError}</div>}
          {(processing || processingProgress) && (
            <ProgressBar progress={processingProgress} />
          )}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status, validated }: { status: string; validated: boolean }) {
  if (status === 'DONE') return <CheckCircle className="h-5 w-5 text-green-500" />
  if (status === 'FAILED') return <XCircle className="h-5 w-5 text-red-500" />
  if (status === 'PROCESSING') return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
  if (validated) return <CheckCircle className="h-5 w-5 text-blue-500" />
  return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
}

function ProgressBar({ progress }: { progress: ProcessingProgressState | null }) {
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 8))
  return (
    <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-950">
            {progress?.label ?? 'İşlem sürüyor'}
          </p>
          <p className="mt-0.5 text-xs text-blue-800">
            {progress?.description ?? 'Tahmini ilerleme hazırlanıyor.'}
          </p>
        </div>
        <span className="font-mono text-sm font-semibold text-blue-800">%{Math.round(percent)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-blue-700">
        Bu gösterge tahminidir; büyük PDF dosyalarında bazı adımlar daha uzun sürebilir.
      </p>
    </div>
  )
}

function getNextAction(params: {
  documentCount: number
  classificationStatus: string
  needsValidation: boolean
  canProcess: boolean
  classifying: boolean
  validating: boolean
  processing: boolean
}): {
  title: string
  description: string
  cta: string
  action: 'upload' | 'classify' | 'validate' | 'process'
  disabled: boolean
  loading: boolean
  blockingReasons: string[]
} {
  if (params.documentCount === 0) {
    return {
      title: 'Belgeleri yükleyin',
      description: 'Belgeleri yükleyin; sistem belge türünü ve ithalat/ihracat yönünü otomatik önerecek.',
      cta: 'Belge seç',
      action: 'upload',
      disabled: false,
      loading: false,
      blockingReasons: [],
    }
  }

  if (params.classificationStatus !== 'AWAITING_VALIDATION' && params.classificationStatus !== 'VALIDATED') {
    return {
      title: 'Belgeleri sistem okusun',
      description: 'Sistem belge türünü, işlem yönünü ve müşteri eşleşmesini önerecek.',
      cta: params.classifying ? 'Okunuyor' : 'Oku ve sınıflandır',
      action: 'classify',
      disabled: params.classifying,
      loading: params.classifying,
      blockingReasons: [],
    }
  }

  if (params.needsValidation) {
    return {
      title: 'Önerileri doğrulayın',
      description: 'İşlem yönü, belge türleri ve müşteri eşleşmesi kullanıcı tarafından onaylanmalı.',
      cta: params.validating ? 'Kaydediliyor' : 'Doğrulamayı kaydet',
      action: 'validate',
      disabled: params.validating,
      loading: params.validating,
      blockingReasons: [
        'İthalat/ihracat yönü seçili olmalı.',
        'Yoksayılmayan her belge için belge türü doğrulanmalı.',
      ],
    }
  }

  return {
    title: 'Analizi başlatın',
    description: 'Doğrulanan belgeler üzerinden okuma, kurallar ve hızlı yapay zeka kural kontrolü çalışacak.',
    cta: params.processing ? 'İşleniyor' : 'Analizi başlat',
    action: 'process',
    disabled: params.processing || !params.canProcess,
    loading: params.processing,
    blockingReasons: [],
  }
}

function docTypeLabel(docType: string): string {
  return DOC_TYPES.find((type) => type.value === docType)?.label ?? docType
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-50 text-green-700'
  if (confidence >= 0.6) return 'bg-yellow-50 text-yellow-700'
  return 'bg-red-50 text-red-700'
}

function clientMatchLabel(matchType: string): string {
  const map: Record<string, string> = {
    TAX_ID: 'vergi numarası eşleşti',
    NAME_ADDRESS: 'ad ve adres eşleşti',
    NAME: 'ad benzerliği',
  }
  return map[matchType] ?? matchType
}
