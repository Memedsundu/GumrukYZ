import { z } from 'zod'

const PackageBreakdownSchema = z.object({
  type: z.string().nullable(),
  count: z.number().nullable(),
})

const InvoiceReferenceSchema = z.object({
  number: z.string().nullable(),
  free_of_charge: z.boolean().nullable(),
  source: z.string().nullable().optional(),
  source_text: z.string().nullable().optional(),
  tps_ref: z.string().nullable().optional(),
  line_number: z.number().nullable().optional(),
  role: z.enum(['MAIN', 'FOC', 'UNKNOWN']).nullable().optional(),
})

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
  country_of_origin: z.string().nullable(),
  gtip_code: z.string().nullable(),
  free_of_charge: z.boolean().nullable(),
  invoice_refs: z.array(InvoiceReferenceSchema).nullable(),
  net_weight: z.number().nullable(),
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
  package_breakdown: z.array(PackageBreakdownSchema).nullable(),
  invoice_refs: z.array(InvoiceReferenceSchema).nullable(),
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
        package_count: z.number().nullable(),
        package_type: z.string().nullable(),
        unit: z.string().nullable(),
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
  package_breakdown: z.array(PackageBreakdownSchema).nullable(),
  country_of_origin: z.string().nullable(),
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

export const DeclarationItemExtractionSchema = z.object({
  line_number: z.number().nullable(),
  gtip_code: z.string().nullable(),
  goods_description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  net_weight: z.number().nullable(),
  gross_weight: z.number().nullable(),
  package_count: z.number().nullable(),
  value: z.number().nullable(),
  customs_value: z.number().nullable(),
  statistical_value: z.number().nullable(),
  fob_value: z.number().nullable(),
  currency: z.string().nullable(),
  origin_country: z.string().nullable(),
  country_of_origin: z.string().nullable(),
  invoice_refs: z.array(InvoiceReferenceSchema).nullable(),
  free_of_charge: z.boolean().nullable(),
})

export type DeclarationItemExtraction = z.infer<typeof DeclarationItemExtractionSchema>

export const DeclarationOutputExtractionSchema = z.object({
  declaration_number: z.string().nullable(),
  declaration_date: z.string().nullable(),
  exporter: z.string().nullable(),
  importer: z.string().nullable(),
  exporter_tax_id: z.string().nullable(),
  importer_tax_id: z.string().nullable(),
  customs_office_code: z.string().nullable(),
  regime_code: z.string().nullable(),
  gtip_code: z.string().nullable(),
  goods_description: z.string().nullable(),
  origin_country: z.string().nullable(),
  country_of_origin: z.string().nullable(),
  package_count: z.number().nullable(),
  package_breakdown: z.array(PackageBreakdownSchema).nullable(),
  gross_weight: z.number().nullable(),
  net_weight: z.number().nullable(),
  total_value: z.number().nullable(),
  fob_value: z.number().nullable(),
  statistical_value: z.number().nullable(),
  customs_value: z.number().nullable(),
  currency: z.string().nullable(),
  incoterm: z.string().nullable(),
  invoice_refs: z.array(InvoiceReferenceSchema).nullable(),
  free_of_charge: z.boolean().nullable(),
  free_of_charge_line_values: z.array(z.number()).nullable(),
  permit_refs: z.array(z.string()).nullable(),
  /** Kalem (line item) rows for multi-item declarations; null when not visible. */
  items: z.array(DeclarationItemExtractionSchema).nullable(),
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
  country_of_origin: z.string().nullable(),
  issuing_authority: z.string().nullable(),
})

export type OriginDocExtraction = z.infer<typeof OriginDocExtractionSchema>
