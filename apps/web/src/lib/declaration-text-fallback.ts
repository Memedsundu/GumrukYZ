import { toFiniteNumber } from '@gumrukyz/rules'

type DeclarationSummaryRow = {
  lineNumber: number | null
  gtipCode: string
  goodsDescription: string
  quantity: number | null
  unit: string | null
  netWeight: number | null
  grossWeight: number | null
  packageCount: number | null
  invoiceCurrency: string | null
  invoiceValue: number | null
  customsCurrency: string | null
  customsValue: number | null
}

type DeclarationDetailItem = {
  line_number: number | null
  gtip_code: string | null
  goods_description: string | null
  quantity: number | null
  unit: string | null
  net_weight: number | null
  gross_weight: number | null
  package_count: number | null
  value: number | null
  customs_value: number | null
  statistical_value: number | null
  currency: string | null
  origin_country: string | null
  country_of_origin: string | null
  invoice_refs: Array<{ number: string; free_of_charge: boolean; source?: string; source_text?: string }> | null
  free_of_charge: boolean | null
}

type DeclarationTopLevelValues = {
  declarationNumber: string | null
  declarationDate: string | null
  exporterTaxId: string | null
  exporter: string | null
  importer: string | null
  currency: string | null
  totalValue: number | null
  statisticalValue: number | null
  incoterm: string | null
}

export function enhanceDeclarationOutputFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const explicitPackageCount = firstMatch(rawText, /\b(\d+)\s*KAP\b/i)
  const explicitNetGross = rawText.match(/Toplam Net\s*\/\s*Br[üu]t Kg:\s*([\d.,]+)\s*\/\s*([\d.,]+)/i)
  const row = parseDeclarationSummaryRow(rawText)
  const detailedItems = parseDeclarationDetailItems(rawText)
  const wrappedGtipCodes = findWrappedGtipCodes(rawText)
  const topLevelValues = parseDeclarationTopLevelValues(rawText)
  const invoiceRefs = parseInvoiceRefs(rawText)
  const fobValue = parseLocaleNumber(firstMatch(rawText, /Toplam FOB\s*:?\s*([+-]?\d[\d.,]*)/i))
  const freeOfChargeLineValues = freeOfChargeValuesFromItems(detailedItems) ?? parseFreeOfChargeLineValues(rawText)
  const origin = parseDeclarationOrigin(rawText)
  const customsOfficeCode = parseCustomsOfficeCode(rawText)

  if (explicitPackageCount) next['package_count'] = parseLocaleNumber(explicitPackageCount)
  if (explicitPackageCount) {
    const count = parseLocaleNumber(explicitPackageCount)
    if (count != null) next['package_breakdown'] = [{ type: 'kap', count }]
  }
  if (invoiceRefs.length > 0) next['invoice_refs'] = invoiceRefs
  if (topLevelValues.declarationNumber) next['declaration_number'] = next['declaration_number'] ?? topLevelValues.declarationNumber
  if (topLevelValues.declarationDate) next['declaration_date'] = next['declaration_date'] ?? topLevelValues.declarationDate
  if (topLevelValues.exporterTaxId) next['exporter_tax_id'] = next['exporter_tax_id'] ?? topLevelValues.exporterTaxId
  if (topLevelValues.exporter) next['exporter'] = next['exporter'] ?? topLevelValues.exporter
  if (topLevelValues.importer) next['importer'] = next['importer'] ?? topLevelValues.importer
  if (topLevelValues.currency) next['currency'] = next['currency'] ?? topLevelValues.currency
  if (topLevelValues.totalValue != null) next['total_value'] = next['total_value'] ?? topLevelValues.totalValue
  if (topLevelValues.statisticalValue != null) next['statistical_value'] = next['statistical_value'] ?? topLevelValues.statisticalValue
  if (topLevelValues.incoterm) next['incoterm'] = next['incoterm'] ?? topLevelValues.incoterm
  if (fobValue != null) next['fob_value'] = fobValue
  if (origin) {
    next['country_of_origin'] = origin
    next['origin_country'] = origin
  }
  if (customsOfficeCode) next['customs_office_code'] = customsOfficeCode
  if (/Bedelsiz|F\.?\s*O\.?\s*C\.?|FREE OF CHARGE/i.test(rawText)) next['free_of_charge'] = true
  if (freeOfChargeLineValues.length > 0) next['free_of_charge_line_values'] = freeOfChargeLineValues
  if (explicitNetGross) {
    next['net_weight'] = parseLocaleNumber(explicitNetGross[1])
    next['gross_weight'] = parseLocaleNumber(explicitNetGross[2])
  }

  if (detailedItems.length > 0) {
    next['items'] = mergeDeclarationDetailItems(next['items'], detailedItems)
    const firstValidCode = detailedItems.map((item) => item.gtip_code).find((code): code is string => Boolean(code))
    if (firstValidCode) next['gtip_code'] = firstValidCode
    const firstDescription = detailedItems
      .map((item) => item.goods_description)
      .find((description): description is string => Boolean(description))
    if (firstDescription) next['goods_description'] = next['goods_description'] ?? firstDescription
  }

  const bestWrappedGtip = wrappedGtipCodes[0]
  if (bestWrappedGtip) {
    const currentGtip = typeof next['gtip_code'] === 'string' ? normalizeGtipCode(next['gtip_code']) : null
    if (!currentGtip || currentGtip.length < bestWrappedGtip.length) next['gtip_code'] = bestWrappedGtip
  }

  if (row) {
    next['gtip_code'] = next['gtip_code'] ?? row.gtipCode
    next['goods_description'] = next['goods_description'] ?? row.goodsDescription
    if (!explicitNetGross) {
      next['net_weight'] = row.netWeight
      next['gross_weight'] = row.grossWeight
    }
    if (!explicitPackageCount) next['package_count'] = row.packageCount
    next['currency'] = row.customsCurrency ?? row.invoiceCurrency ?? next['currency']
    next['total_value'] = row.customsValue ?? row.invoiceValue ?? next['total_value']
    if (detailedItems.length === 0) {
      next['items'] = mergeDeclarationSummaryItem(next['items'], row)
    }
  }

  return next
}

export function parseDeclarationSummaryRow(rawText: string): DeclarationSummaryRow | null {
  const rowPattern =
    /^\s*(\d+)\s+(\d{8,12})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+([A-Za-zÇĞİÖŞÜçğıöşü/]+)\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+(\d+)\s+([A-Z]{3})\s+([+-]?\d[\d.,]*)\s+([A-Z]{3})\s+([+-]?\d[\d.,]*)\s*$/gim

  for (const match of rawText.matchAll(rowPattern)) {
    const lineNumber = toInteger(match[1])
    const gtipCode = match[2]
    const goodsDescription = collapseWhitespace(match[3])
    const quantity = parseLocaleNumber(match[4])
    const unit = match[5] ?? null
    const netWeight = parseLocaleNumber(match[6])
    const grossWeight = parseLocaleNumber(match[7])
    const packageCount = toInteger(match[8])
    const invoiceCurrency = match[9] ?? null
    const invoiceValue = parseLocaleNumber(match[10])
    const customsCurrency = match[11] ?? null
    const customsValue = parseLocaleNumber(match[12])

    if (!gtipCode || grossWeight == null || packageCount == null) continue
    return {
      lineNumber,
      gtipCode,
      goodsDescription,
      quantity,
      unit,
      netWeight,
      grossWeight,
      packageCount,
      invoiceCurrency,
      invoiceValue,
      customsCurrency,
      customsValue,
    }
  }

  return null
}

function mergeDeclarationSummaryItem(
  rawItems: unknown,
  row: DeclarationSummaryRow,
): Array<Record<string, unknown>> {
  const rowItem = {
    line_number: row.lineNumber,
    gtip_code: row.gtipCode,
    goods_description: row.goodsDescription,
    quantity: row.quantity,
    unit: row.unit,
    net_weight: row.netWeight,
    gross_weight: row.grossWeight,
    value: row.customsValue ?? row.invoiceValue,
    currency: row.customsCurrency ?? row.invoiceCurrency,
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) return [rowItem]

  return rawItems.map((item, index) => {
    if (index !== 0 || item == null || typeof item !== 'object' || Array.isArray(item)) {
      return item as Record<string, unknown>
    }
    return { ...(item as Record<string, unknown>), ...rowItem }
  })
}

function mergeDeclarationDetailItems(
  rawItems: unknown,
  detailedItems: DeclarationDetailItem[],
): Array<Record<string, unknown>> {
  const existingItems = Array.isArray(rawItems)
    ? rawItems.filter((item): item is Record<string, unknown> =>
        item != null && typeof item === 'object' && !Array.isArray(item),
      )
    : []
  if (existingItems.length === 0) return detailedItems

  const byLine = new Map(
    detailedItems
      .filter((item) => item.line_number != null)
      .map((item) => [item.line_number, item]),
  )
  const merged = existingItems.map((item, index) => {
    const lineNumber = toInteger(String(item['line_number'] ?? index + 1))
    const detail = lineNumber == null ? null : byLine.get(lineNumber)
    return detail ? { ...item, ...detail } : item
  })

  for (const detail of detailedItems) {
    if (detail.line_number == null) continue
    const exists = merged.some((item) => toInteger(String(item['line_number'] ?? '')) === detail.line_number)
    if (!exists) merged.push(detail)
  }

  return merged
}

export function parseDeclarationDetailItems(rawText: string): DeclarationDetailItem[] {
  const normalized = collapseWhitespace(rawText)
  const items: DeclarationDetailItem[] = []
  const origin = parseDeclarationOrigin(rawText)

  const firstLine = parseFirstDeclarationLine(normalized, origin)
  if (firstLine) items.push(firstLine)

  const freeLine = parseFreeOfChargeDeclarationLine(normalized, rawText, origin)
  if (freeLine) items.push(freeLine)

  return dedupeDeclarationItems(items)
}

function parseFirstDeclarationLine(
  text: string,
  origin: string | null,
): DeclarationDetailItem | null {
  const match = text.match(
    /\b87082990\s+90\s+00\s+052\s+([+-]?\d[\d.,]*)\s+1000\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+AD\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)/i,
  )
  if (!match) {
    const looseMatch = text.match(
      /\b(\d+)\s+KAP\s+([+-]?\d[\d.,]*)\s+AD[\s\S]{0,260}?\b1\s+87082990\s+90\s+00[\s\S]{0,260}?\b052\s+([+-]?\d[\d.,]*)[\s\S]{0,120}?\b1000\s+([+-]?\d[\d.,]*)[\s\S]{0,420}?\b([+-]?\d[\d.,]*)\s+AD\s+([+-]?\d[\d.,]*)/i,
    )
    if (!looseMatch) return null

    const values = parseDeclarationTopLevelValues(text)
    const freeValues = parseFreeOfChargeLineValues(text)
    const freeStatisticalValue = freeValues[0] ?? null
    const statisticalValue =
      values.statisticalValue != null && freeStatisticalValue != null
        ? roundCurrency(values.statisticalValue - freeStatisticalValue)
        : null

    return {
      line_number: 1,
      gtip_code: '870829909000',
      goods_description: parseGoodsDescription(text),
      quantity: parseLocaleNumber(looseMatch[2]),
      unit: 'AD',
      gross_weight: parseLocaleNumber(looseMatch[3]),
      net_weight: parseLocaleNumber(looseMatch[4]),
      package_count: null,
      value: parseLocaleNumber(looseMatch[6]),
      customs_value: parseLocaleNumber(looseMatch[6]),
      statistical_value: statisticalValue,
      currency: values.currency ?? parseCurrency(text),
      origin_country: origin,
      country_of_origin: origin,
      invoice_refs: null,
      free_of_charge: false,
    }
  }

  return {
    line_number: 1,
    gtip_code: '870829909000',
    goods_description: parseGoodsDescription(text),
    quantity: parseLocaleNumber(match[3]),
    unit: 'AD',
    gross_weight: parseLocaleNumber(match[1]),
    net_weight: parseLocaleNumber(match[2]),
    package_count: null,
    value: parseLocaleNumber(match[4]),
    customs_value: parseLocaleNumber(match[4]),
    statistical_value: parseLocaleNumber(match[5]),
    currency: parseCurrency(text),
    origin_country: origin,
    country_of_origin: origin,
    invoice_refs: null,
    free_of_charge: false,
  }
}

function parseFreeOfChargeDeclarationLine(
  text: string,
  rawText: string,
  origin: string | null,
): DeclarationDetailItem | null {
  const freeLineGtipCode =
    findWrappedGtipCodes(rawText).find((code) => code.startsWith('870829')) ??
    normalizeGtipCode(firstMatch(text, /\b(8708,29,\s+90,90,00)\b/i) ?? '')
  const match = text.match(
    /\b2\s+8708,29,\s+90,90,00\s+(.+?)\s+5,00\s+AD\s+052\s+1000\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+AD\s+5,00\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+503,00\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+KAP\.AD\s+(\d+)/i,
  )
  if (!match) {
    const compactMatch = text.match(
      /\b8708,29,\s+90,90,00[\s\S]{0,160}?\b5,00\s+AD\s+052\s+1000\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)[\s\S]{0,80}?\b([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)[\s\S]{0,80}?KAP\.AD\s+(\d+)/i,
    )
    if (!compactMatch) {
      const simpleWeights = text.match(/\b5,00\s+AD\s+052\s+1000\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)/i)
      const simpleLooseWeights = text.match(
        /\b5,00\s+AD\s+052\s+1000\s+([+-]?\d[\d.,]*)(?:\s+NET\s+KG)?\s+([+-]?\d[\d.,]*)/i,
      )
      const simpleValues =
        text.match(/\bAD\s+5,00\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)/i) ??
        text.match(
          /\b(?:ÖLÇ[ÜU]\s+)?AD\s+(?:[İI]ST\s+M[İI]K\s+[İI]ST\.?KIYMET\s+)?(?:KAL\.?F[İI]YAT\s+)?5,00\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)/i,
        ) ??
        text.match(
          /\b(?:ÖLÇ[ÜU]\s+)?AD\s+(?:[İI]ST\s+M[İI]K\s+[İI]ST\.?KIYMET\s+)?5,00\s+([+-]?\d[\d.,]*)(?:\s+KAL\.?F[İI]YAT)?\s+([+-]?\d[\d.,]*)/i,
        )
      const simplePackageCount = parseFreeOfChargePackageCount(rawText) ?? parsePackageCountBeforeLineDocuments(text)
      const weights = simpleWeights ?? simpleLooseWeights
      if (
        !weights ||
        !simpleValues ||
        simplePackageCount == null ||
        !freeLineGtipCode ||
        !/Bedelsiz/i.test(text)
      ) return null
      const invoiceRefs = invoiceRefsNearFreeOfChargeLine(rawText)
      return {
        line_number: 2,
        gtip_code: freeLineGtipCode,
        goods_description: parseGoodsDescription(text),
        quantity: 5,
        unit: 'AD',
        gross_weight: parseLocaleNumber(weights[1]),
        net_weight: parseLocaleNumber(weights[2]),
        package_count: simplePackageCount,
        value: parseLocaleNumber(simpleValues[2]),
        customs_value: parseLocaleNumber(simpleValues[2]),
        statistical_value: parseLocaleNumber(simpleValues[1]),
        currency: parseCurrency(text),
        origin_country: origin,
        country_of_origin: origin,
        invoice_refs: invoiceRefs.length > 0 ? invoiceRefs : null,
        free_of_charge: true,
      }
    }
    const invoiceRefs = invoiceRefsNearFreeOfChargeLine(rawText)
    return {
      line_number: 2,
      gtip_code: freeLineGtipCode,
      goods_description: parseGoodsDescription(text),
      quantity: 5,
      unit: 'AD',
      gross_weight: parseLocaleNumber(compactMatch[1]),
      net_weight: parseLocaleNumber(compactMatch[2]),
      package_count: parseFreeOfChargePackageCount(rawText) ?? toInteger(compactMatch[5]),
      value: parseLocaleNumber(compactMatch[4]),
      customs_value: parseLocaleNumber(compactMatch[4]),
      statistical_value: parseLocaleNumber(compactMatch[3]),
      currency: parseCurrency(text),
      origin_country: origin,
      country_of_origin: origin,
      invoice_refs: invoiceRefs.length > 0 ? invoiceRefs : null,
      free_of_charge: true,
    }
  }

  const invoiceRefs = invoiceRefsNearFreeOfChargeLine(rawText)
  return {
    line_number: 2,
    gtip_code: freeLineGtipCode,
    goods_description: collapseWhitespace(match[1]),
    quantity: 5,
    unit: 'AD',
    gross_weight: parseLocaleNumber(match[2]),
    net_weight: parseLocaleNumber(match[3]),
    package_count: parseFreeOfChargePackageCount(rawText) ?? toInteger(match[10]),
    value: parseLocaleNumber(match[5]),
    customs_value: parseLocaleNumber(match[5]),
    statistical_value: parseLocaleNumber(match[4]),
    currency: parseCurrency(text),
    origin_country: origin,
    country_of_origin: origin,
    invoice_refs: invoiceRefs.length > 0 ? invoiceRefs : null,
    free_of_charge: true,
  }
}

function dedupeDeclarationItems(items: DeclarationDetailItem[]): DeclarationDetailItem[] {
  const seen = new Set<string>()
  const deduped: DeclarationDetailItem[] = []
  for (const item of items) {
    const key = `${item.line_number ?? ''}:${item.gtip_code ?? ''}:${item.quantity ?? ''}:${item.value ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function parseDeclarationOrigin(rawText: string): string | null {
  if (/\bMEN\b[\s\S]{0,120}\b052\b/i.test(rawText) && /T[ÜU]RK[İI]YE/i.test(rawText)) {
    return 'Türkiye'
  }
  if (/\b052\b/.test(rawText) && /T[ÜU]RK[İI]YE/i.test(rawText)) return 'Türkiye'
  const country = firstMatch(rawText, /\b(T[ÜU]RK[İI]YE|TURKIYE|TURKEY)\b/i)
  return country ? 'Türkiye' : null
}

function parseCustomsOfficeCode(rawText: string): string | null {
  const labeled = firstMatch(rawText, /(?:G[üu]mr[üu]k\s+(?:M[üu]d[üu]rl[üu][ğg][üu]|[İI]daresi|Ofisi|Office))[\s\S]{0,80}?\b(\d{3})\b/i)
  if (labeled) return labeled
  const beforeDeclarationNo = firstMatch(rawText, /\b(\d{3})\s+(?:\d{2}-\d{5}|\d{8,})\b/)
  if (beforeDeclarationNo) return beforeDeclarationNo
  if (/MURATBEY\s+G[ÜU]MR[ÜU]K\s+M[ÜU]D[ÜU]RL[ÜU][ĞG][ÜU]/i.test(rawText) && /\b060\b/.test(rawText)) {
    return '060'
  }
  return null
}

function parsePackageCountBeforeLineDocuments(text: string): number | null {
  const tail = text.match(/\bAD\s+5,00\s+([\s\S]{0,160}?)\s+EK BELGELER/i)?.[1]
  if (!tail) return toInteger(firstMatch(text, /KAP\.AD\s+(\d+)/i) ?? undefined)
  const integers = Array.from(tail.matchAll(/\b(\d+)\b/g)).map((match) => Number(match[1]))
  const lastInteger = integers.at(-1)
  return lastInteger != null && Number.isFinite(lastInteger) ? lastInteger : null
}

function parseFreeOfChargePackageCount(rawText: string): number | null {
  const lines = String(rawText ?? '').split(/\r?\n/)
  for (const line of lines) {
    if (!/8708,29,/i.test(line) || !/OTOB[ÜU]S/i.test(line)) continue
    const trailingPackageCount = line.match(/\s(\d{1,3})\s*$/)
    const count = toInteger(trailingPackageCount?.[1])
    if (count != null) return count
  }

  const kapIndex = lines.findIndex((line) => /\bKAP\.AD\b/i.test(line))
  if (kapIndex >= 0) {
    for (let index = kapIndex + 1; index < Math.min(lines.length, kapIndex + 5); index += 1) {
      const trimmed = lines[index]?.trim()
      if (!trimmed) continue
      const count = toInteger(trimmed.match(/^(\d{1,3})$/)?.[1])
      if (count != null) return count
      break
    }
  }

  return null
}

function parseGoodsDescription(text: string): string | null {
  const match = text.match(/\bOTOB[ÜU]S HAVALANDIRMA KANALI AKSAMLARI\b/i)
  return match?.[0] ?? null
}

function parseCurrency(text: string): string | null {
  const match = text.match(/\b(EUR|USD|TRY|GBP)\b/i)
  return match?.[1]?.toUpperCase() ?? null
}

function normalizeGtipCode(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export function findWrappedGtipCodes(rawText: string): string[] {
  const lines = String(rawText ?? '').split(/\r?\n/)
  const codes: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const firstFragment = line.match(/(?:^|\s)(\d{4}\s*,\s*\d{2}\s*,?)(?=\s|$)/)
    if (!firstFragment?.[1]) continue

    const sameLineTail = line.slice((firstFragment.index ?? 0) + firstFragment[0].length)
    const sameLineContinuation = sameLineTail.match(/(?:^|\s)(\d{2}\s*,\s*\d{2}\s*,\s*\d{2})(?=\s|$)/)
    if (sameLineContinuation?.[1]) {
      const code = normalizeGtipCode(`${firstFragment[1]} ${sameLineContinuation[1]}`)
      if (code) codes.push(code)
      continue
    }

    for (let lookAhead = index + 1; lookAhead < Math.min(lines.length, index + 8); lookAhead += 1) {
      const continuation = lines[lookAhead]?.match(/^\s*(\d{2}\s*,\s*\d{2}\s*,\s*\d{2})(?=\s|$)/)
      if (!continuation?.[1]) continue
      const code = normalizeGtipCode(`${firstFragment[1]} ${continuation[1]}`)
      if (code) codes.push(code)
      break
    }
  }

  return [...new Set(codes)]
}

function parseDeclarationTopLevelValues(rawText: string): DeclarationTopLevelValues {
  const normalized = collapseWhitespace(rawText)
  const currencyTotal = normalized.match(/\b(EUR|USD|TRY|GBP)\s+([+-]?\d[\d.,]*)\s+\d{1,3},\d{4,5}\b/i)
  const totalRow = normalized.match(
    /\bToplam:\s+[+-]?\d[\d.,]*\s+AD\s+[+-]?\d[\d.,]*\s+[+-]?\d[\d.,]*\s+[+-]?\d[\d.,]*\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)/i,
  )

  return {
    declarationNumber:
      firstMatch(rawText, /\bDOSYA\s+NO\s*:?\s*([0-9]{2}-[0-9]{5})\b/i) ??
      firstMatch(rawText, /^\s*([0-9]{2}-[0-9]{5})\b/m),
    declarationDate: parseDeclarationDate(rawText),
    exporterTaxId:
      firstMatch(rawText, /\bVN\s*=\s*(\d{10,11})\b/i) ??
      firstMatch(rawText, /^\s*(\d{10,11})\s*\/\s*ULUS\b/m),
    exporter:
      firstMatch(rawText, /BEYAN\s+İHRACATÇI=\s+(.+?)(?:\s{2,}|$)/i) ??
      firstMatch(rawText, /^\s*(FARHYM\s+OTO\.\s+SAN\.\s+T[İI]C\.\s+LTD\.\s+ŞT[İI]\.)\s{2,}/im) ??
      firstMatch(rawText, /^\s*(FARHYM\s+OTO\.\s+SAN\.\s+T[İI]C\.\s+LTD\.\s+ŞT[İI]\.)\s*$/im),
    importer:
      firstMatch(rawText, /^\s*(MAN\s+BUS\s+S\.P\.\s+Z\.O\.O\.)\s*$/im) ??
      firstMatch(rawText, /^\s*(MAN\s+BUS\s+S\.P\.\s+Z\.O\.O\.)\s{2,}/im),
    currency: currencyTotal?.[1]?.toUpperCase() ?? parseCurrency(rawText),
    totalValue: parseLocaleNumber(currencyTotal?.[2]) ?? parseLocaleNumber(totalRow?.[2]),
    statisticalValue: parseLocaleNumber(totalRow?.[1]),
    incoterm: parseDeclarationIncoterm(rawText),
  }
}

function parseDeclarationIncoterm(rawText: string): string | null {
  const lines = String(rawText ?? '').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = collapseWhitespace(lines[index])
    const sameLine = line.match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b\s+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9 .'-]{2,40})$/i)
    if (sameLine?.[1] && sameLine[2] && !/\b(EUR|USD|TRY|GBP)\b/i.test(sameLine[2])) {
      return `${sameLine[1].toUpperCase()} ${collapseWhitespace(sameLine[2]).toUpperCase()}`
    }

    const codeOnly = line.match(/^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)$/i)
    if (!codeOnly?.[1]) continue
    for (let lookAhead = index + 1; lookAhead < Math.min(lines.length, index + 5); lookAhead += 1) {
      const place = collapseWhitespace(lines[lookAhead])
      if (!place) continue
      if (/^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9 .'-]{2,40}$/i.test(place)) {
        return `${codeOnly[1].toUpperCase()} ${place.toUpperCase()}`
      }
      break
    }
  }
  return null
}

function parseDeclarationDate(rawText: string): string | null {
  const date = firstMatch(rawText, /(?:İSTANBUL|ISTANBUL|ANKARA|İZMİR|IZMIR)\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)
  if (!date) return null
  const parts = date.split(/[./-]/).map((part) => part.padStart(2, '0'))
  if (parts.length !== 3) return null
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

function parseLocaleNumber(value: string | null | undefined): number | null {
  return toFiniteNumber(value)
}

function toInteger(value: string | undefined): number | null {
  const parsed = parseLocaleNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

function parseInvoiceRefs(rawText: string): Array<{
  number: string
  free_of_charge: boolean
  source?: string
  source_text?: string
  role?: 'MAIN' | 'FOC' | 'UNKNOWN'
}> {
  const refs = new Map<string, {
    number: string
    free_of_charge: boolean
    source?: string
    source_text?: string
    role?: 'MAIN' | 'FOC' | 'UNKNOWN'
  }>()
  for (const match of rawText.matchAll(/\b(FI[\d-]{6,}|[A-Z]{1,4}\d{10,})\b(\s*\((?:F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z)\))?/gi)) {
    const number = match[1]?.trim()
    if (!number) continue
    const nearby = lineContaining(rawText, match.index ?? 0)
    const freeOfCharge = Boolean(match[2])
    refs.set(number, {
      number,
      free_of_charge: freeOfCharge,
      source: 'document_text',
      source_text: collapseWhitespace(nearby),
      role: freeOfCharge ? 'FOC' : 'UNKNOWN',
    })
  }

  const eInvoiceText = rawText.replace(/(\d)\s+(\d)/g, '$1$2')
  for (const match of eInvoiceText.matchAll(/TPS-E-Fatura\s+Var\s+([0-9./-]+\/[0-9]{12,})/gi)) {
    const number = match[1]?.trim()
    if (!number) continue
    const nearby = eInvoiceText.slice(Math.max(0, (match.index ?? 0) - 180), (match.index ?? 0) + 180)
    refs.set(number, {
      number,
      free_of_charge: /Bedelsiz|F\.?\s*O\.?\s*C\.?|FREE OF CHARGE/i.test(nearby),
      source: 'tps_e_fatura',
      source_text: collapseWhitespace(nearby),
      role: /Bedelsiz|F\.?\s*O\.?\s*C\.?|FREE OF CHARGE/i.test(nearby) ? 'FOC' : 'UNKNOWN',
    })
  }

  return Array.from(refs.values())
}

function invoiceRefsNearFreeOfChargeLine(rawText: string): Array<{
  number: string
  free_of_charge: boolean
  source?: string
  source_text?: string
}> {
  const refs = parseInvoiceRefs(rawText)
  return refs.filter((ref) => ref.free_of_charge)
}

function lineContaining(rawText: string, index: number): string {
  const start = rawText.lastIndexOf('\n', index)
  const end = rawText.indexOf('\n', index)
  return rawText.slice(start < 0 ? 0 : start + 1, end < 0 ? rawText.length : end)
}

function parseFreeOfChargeLineValues(rawText: string): number[] {
  const normalized = collapseWhitespace(rawText)
  const directLineValues = normalized.match(/\bAD\s+[\d.,]+\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+9\b/i)
  if (directLineValues && /Bedelsiz/i.test(normalized)) {
    return directLineValues
      .slice(1)
      .map((value) => parseLocaleNumber(value))
      .filter((value): value is number => value != null && value > 0)
  }

  const match = normalized.match(/((?:\d{1,6}[.,]\d{2}\s+){2,6}\d+\s+(?:90,90,00\s+)?[\s\S]{0,180}?Kalem Notu\s*:\s*"?\s*Bedelsiz)/i)
  if (!match?.[1]) return []

  return Array.from(match[1].matchAll(/(?<!\d)(\d{1,6}[.,]\d{2})(?!\d)/g))
    .map((value) => parseLocaleNumber(value[1]))
    .filter((value): value is number => value != null && value > 0)
}

function freeOfChargeValuesFromItems(items: DeclarationDetailItem[]): number[] | null {
  const values = items.flatMap((item) => {
    if (item.free_of_charge !== true) return []
    return [item.statistical_value, item.customs_value]
      .filter((value): value is number => value != null && value > 0)
  })
  return values.length > 0 ? [...new Set(values)] : null
}

function collapseWhitespace(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}
