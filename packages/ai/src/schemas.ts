import { z } from 'zod'

// ─── Invoice extraction schema ───────────────────────────────────────────────

export const InvoiceExtractionSchema = z.object({
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  seller_name: z.string().nullable(),
  seller_address: z.string().nullable(),
  buyer_name: z.string().nullable(),
  buyer_address: z.string().nullable(),
  consignee: z.string().nullable(),
  currency: z.string().nullable(),
  total_amount: z.number().nullable(),
  incoterm: z.string().nullable(),
  delivery_place: z.string().nullable(),
  items: z
    .array(
      z.object({
        description: z.string().nullable(),
        hs_code: z.string().nullable(),
        quantity: z.number().nullable(),
        unit: z.string().nullable(),
        unit_price: z.number().nullable(),
        total_price: z.number().nullable(),
      }),
    )
    .nullable(),
})

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>

// ─── Packing list extraction schema ──────────────────────────────────────────

export const PackingListExtractionSchema = z.object({
  package_count: z.number().nullable(),
  package_type: z.string().nullable(),
  gross_weight: z.number().nullable(),
  net_weight: z.number().nullable(),
  dimensions: z.string().nullable(),
  goods_description: z.string().nullable(),
  shipper: z.string().nullable(),
  consignee: z.string().nullable(),
  items: z
    .array(
      z.object({
        description: z.string().nullable(),
        quantity: z.number().nullable(),
        net_weight: z.number().nullable(),
        gross_weight: z.number().nullable(),
      }),
    )
    .nullable(),
})

export type PackingListExtraction = z.infer<typeof PackingListExtractionSchema>

// ─── Loading instruction extraction schema ───────────────────────────────────

export const LoadingInstructionExtractionSchema = z.object({
  shipper: z.string().nullable(),
  consignee: z.string().nullable(),
  delivery_address: z.string().nullable(),
  goods_description: z.string().nullable(),
  gross_weight: z.number().nullable(),
  net_weight: z.number().nullable(),
  package_count: z.number().nullable(),
  delivery_term: z.string().nullable(),
  incoterm: z.string().nullable(),
  loading_port: z.string().nullable(),
  discharge_port: z.string().nullable(),
})

export type LoadingInstructionExtraction = z.infer<typeof LoadingInstructionExtractionSchema>

// ─── Transport document extraction schema ────────────────────────────────────

export const TransportDocExtractionSchema = z.object({
  document_number: z.string().nullable(),
  document_type: z.string().nullable(), // CMR, AWB, B/L, etc.
  shipper: z.string().nullable(),
  consignee: z.string().nullable(),
  transport_mode: z.string().nullable(),
  departure: z.string().nullable(),
  destination: z.string().nullable(),
  goods_description: z.string().nullable(),
  gross_weight: z.number().nullable(),
  package_count: z.number().nullable(),
  vehicle_plate_or_ref: z.string().nullable(),
})

export type TransportDocExtraction = z.infer<typeof TransportDocExtractionSchema>

// ─── Declaration output extraction schema ────────────────────────────────────

export const DeclarationOutputExtractionSchema = z.object({
  declaration_number: z.string().nullable(),
  declaration_date: z.string().nullable(),
  exporter: z.string().nullable(),
  importer: z.string().nullable(),
  regime_code: z.string().nullable(),
  gtip_code: z.string().nullable(),
  goods_description: z.string().nullable(),
  package_count: z.number().nullable(),
  gross_weight: z.number().nullable(),
  net_weight: z.number().nullable(),
  total_value: z.number().nullable(),
  currency: z.string().nullable(),
  incoterm: z.string().nullable(),
  permit_refs: z.array(z.string()).nullable(),
})

export type DeclarationOutputExtraction = z.infer<typeof DeclarationOutputExtractionSchema>

// ─── Origin document extraction schema ───────────────────────────────────────

export const OriginDocExtractionSchema = z.object({
  document_type: z.string().nullable(), // EUR.1, A.TR, Form A, etc.
  document_number: z.string().nullable(),
  issue_date: z.string().nullable(),
  exporter: z.string().nullable(),
  consignee: z.string().nullable(),
  goods_description: z.string().nullable(),
  origin_country: z.string().nullable(),
  issuing_authority: z.string().nullable(),
})

export type OriginDocExtraction = z.infer<typeof OriginDocExtractionSchema>
