import { DataClassification, TenantPlan } from '@gumrukyz/domain'
import { ALL_RULES } from '@gumrukyz/rules'
import { prisma } from './client.js'
import { REGULATION_SOURCE_MANIFEST } from './regulation-source-manifest.js'
import { RULE_SEED_METADATA } from './rule-seed-metadata.js'

async function main() {
  console.log('Seeding database...')

  // Upsert internal tenant
  let internalTenant = await prisma.tenant.upsert({
    where: { clerkOrgId: process.env['INTERNAL_TENANT_CLERK_ORG_ID'] ?? 'internal_dev' },
    update: {},
    create: {
      clerkOrgId: process.env['INTERNAL_TENANT_CLERK_ORG_ID'] ?? 'internal_dev',
      name: 'GümrükYZ Internal',
      plan: TenantPlan.INTERNAL,
      dataClassificationAllowed: [
        DataClassification.SYNTHETIC,
        DataClassification.REDACTED,
        DataClassification.REAL,
      ],
    },
  })
  if (!internalTenant.dataClassificationAllowed.includes(DataClassification.REAL)) {
    internalTenant = await prisma.tenant.update({
      where: { id: internalTenant.id },
      data: {
        dataClassificationAllowed: [
          ...internalTenant.dataClassificationAllowed,
          DataClassification.REAL,
        ],
      },
    })
  }
  console.log('Tenant:', internalTenant.name)

  const adminClerkUserId = process.env['INTERNAL_ADMIN_CLERK_USER_ID']?.trim()
  if (adminClerkUserId) {
    const adminEmail = process.env['INTERNAL_ADMIN_EMAIL']?.trim() ?? 'admin@gumrukyz.local'
    await prisma.user.upsert({
      where: {
        clerkUserId_tenantId: {
          clerkUserId: adminClerkUserId,
          tenantId: internalTenant.id,
        },
      },
      update: {
        email: adminEmail,
        role: 'PLATFORM_ADMIN',
      },
      create: {
        clerkUserId: adminClerkUserId,
        email: adminEmail,
        tenantId: internalTenant.id,
        role: 'PLATFORM_ADMIN',
      },
    })
    console.log('Admin user:', adminEmail)
  } else {
    console.warn('INTERNAL_ADMIN_CLERK_USER_ID is not set; no admin user was provisioned.')
  }

  // Seed source documents from the same manifest used by regulation ingestion.
  for (const source of REGULATION_SOURCE_MANIFEST) {
    const existing = await prisma.sourceDocument.findFirst({
      where: {
        OR: [
          { url: source.url },
          { title: source.title },
        ],
      },
    })
    const data = {
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      jurisdiction: source.jurisdiction,
      language: source.language,
      effectiveDate: source.effectiveDate ? new Date(source.effectiveDate) : null,
      rawExcerpt: source.fallbackChunks?.join(' ').slice(0, 800) ?? `${source.title} source metadata.`,
    }

    if (existing) {
      await prisma.sourceDocument.update({ where: { id: existing.id }, data })
    } else {
      await prisma.sourceDocument.create({ data })
      console.log('Source document:', source.title)
    }
  }

  await seedRules()
  await seedRuleLegalCitations()

  console.log('Seed complete.')
}

/**
 * Seed ACTIVE rules derived from the executable registry (ALL_RULES) so the
 * DB cannot drift from the code rules: name, severity and appliesToDocTypes
 * come from the RuleDefinition; Turkish description, field checks and fixture
 * refs come from RULE_SEED_METADATA. The upsert UPDATES existing rows, so a
 * reseed always converges to the current registry.
 */
async function seedRules() {
  const sourceDocuments = await prisma.sourceDocument.findMany({
    select: { id: true, title: true },
  })
  const sourceIdByTitle = new Map(sourceDocuments.map((source) => [source.title, source.id]))

  for (const rule of ALL_RULES) {
    const meta = RULE_SEED_METADATA[rule.code]
    if (!meta) {
      throw new Error(
        `RULE_SEED_METADATA is missing an entry for ${rule.code}. ` +
        'Add it to packages/db/src/rule-seed-metadata.ts before seeding.',
      )
    }

    const sourceDocumentId = meta.sourceTitle
      ? sourceIdByTitle.get(meta.sourceTitle) ?? null
      : null

    const data = {
      name: rule.name,
      description: meta.description,
      appliesToDocTypes: rule.appliesToDocTypes as string[],
      fieldChecks: meta.fieldChecks,
      severity: rule.severity as string,
      sourceDocumentId,
      fixturePassRef: meta.fixturePassRef,
      fixtureFailRef: meta.fixtureFailRef,
    }

    await prisma.rule.upsert({
      where: { ruleCode: rule.code },
      update: data,
      create: {
        ruleCode: rule.code,
        ...data,
        lifecycleStatus: 'ACTIVE',
        effectiveFrom: new Date('2024-01-01'),
      },
    })
    console.log('Rule:', rule.code)
  }

  // Surface (but do not touch) DB rules that no longer exist in the registry.
  const registryCodes = ALL_RULES.map((rule) => rule.code)
  const staleRules = await prisma.rule.findMany({
    where: { ruleCode: { notIn: registryCodes }, lifecycleStatus: 'ACTIVE' },
    select: { ruleCode: true },
  })
  if (staleRules.length > 0) {
    console.warn(
      'ACTIVE DB rules with no matching code rule (left untouched):',
      staleRules.map((rule) => rule.ruleCode).join(', '),
    )
  }
}

async function seedRuleLegalCitations() {
  const rules = await prisma.rule.findMany({
    where: { lifecycleStatus: 'ACTIVE' },
    select: { id: true, ruleCode: true },
  })
  const sources = await prisma.sourceDocument.findMany()
  const sourceByTitle = new Map(sources.map((source) => [source.title, source]))

  await prisma.ruleLegalCitation.deleteMany({
    where: { ruleId: { in: rules.map((rule) => rule.id) } },
  })

  for (const rule of rules) {
    const spec = citationSpecForRule(rule.ruleCode)
    if (!spec) continue
    const source = sourceByTitle.get(spec.sourceTitle)
    if (!source) {
      console.warn(`Citation source missing for ${rule.ruleCode}: ${spec.sourceTitle}`)
      continue
    }
    await prisma.ruleLegalCitation.create({
      data: {
        ruleId: rule.id,
        sourceDocumentId: source.id,
        articleLabel: spec.articleLabel,
        excerpt: spec.excerpt,
        url: source.url,
        verifiedAt: source.lastVerifiedAt ?? new Date(),
      },
    })
    console.log('Citation:', rule.ruleCode, spec.articleLabel)
  }
}

function citationSpecForRule(ruleCode: string): {
  sourceTitle: string
  articleLabel: string
  excerpt: string
} | null {
  if (ruleCode === 'PRES-003' || ruleCode.startsWith('BL-')) {
    return {
      sourceTitle: ruleCode.startsWith('BL-') ? 'FIATA Bill of Lading Model Rules' : 'Gümrük Yönetmeliği',
      articleLabel: ruleCode.startsWith('BL-') ? 'FIATA FBL zorunlu alanlar' : 'Madde 200',
      excerpt: ruleCode.startsWith('BL-')
        ? 'Konşimento ve taşıma belgelerinde gönderici, alıcı, yükleme/boşaltma yeri ve eşya bilgileri kontrol edilmelidir.'
        : 'Taşıma belgesi, gümrük beyannamesi ekinde tevsik belgesi olarak aranabilir.',
    }
  }

  if (ruleCode.startsWith('GTIP-')) {
    return {
      sourceTitle: 'Türk Gümrük Tarife Cetveli',
      articleLabel: 'GTİP / TGTC',
      excerpt: 'GTİP, Türk Gümrük Tarife Cetvelindeki sekiz haneli tarife pozisyonudur ve eşyanın doğru sınıflandırılması için kullanılır.',
    }
  }

  if (ruleCode === 'INV-006' || ruleCode === 'CROSS-003' || ruleCode === 'CROSS-007') {
    return {
      sourceTitle: 'ICC Incoterms 2020',
      articleLabel: 'Incoterms 2020',
      excerpt: 'Incoterms 2020 teslim şekilleri tarafların teslim, masraf ve risk sorumluluklarını belirler.',
    }
  }

  if (ruleCode.startsWith('INV-') || ruleCode.startsWith('VAL-')) {
    return {
      sourceTitle: 'Gümrük Yönetmeliği',
      articleLabel: 'Madde 114',
      excerpt: 'Faturada satıcı/alıcı, fatura numarası, düzenlenme tarihi, eşyanın tanımı, birim fiyat, toplam tutar, teslim şekli ve para birimi bulunmalıdır.',
    }
  }

  if (ruleCode.startsWith('PL-') || ruleCode === 'CROSS-002' || ruleCode === 'CROSS-006' || ruleCode === 'CROSS-008') {
    return {
      sourceTitle: 'Gümrük Yönetmeliği',
      articleLabel: 'Madde 180-183',
      excerpt: 'Çeki listesinde ağırlık, paket sayısı, kap işareti ve ambalaj türü belirtilmeli; toplam brüt/net ağırlıklar diğer belgelerle tutarlı olmalıdır.',
    }
  }

  if (ruleCode.startsWith('COO-') || ruleCode === 'PRES-004') {
    return {
      sourceTitle: '4458 Sayılı Gümrük Kanunu',
      articleLabel: 'Madde 241',
      excerpt: 'Menşe ispat belgesi olmaksızın tercihli tarife talebinde bulunulamaz; menşe/dolaşım belgeleri fatura ile uyumlu olmalıdır.',
    }
  }

  if (ruleCode.startsWith('DECL-')) {
    return {
      sourceTitle: ruleCode === 'DECL-005' ? 'Gümrük Yönetmeliği' : '4458 Sayılı Gümrük Kanunu',
      articleLabel: ruleCode === 'DECL-005' ? 'Madde 305' : 'Madde 14-15',
      excerpt: ruleCode === 'DECL-005'
        ? 'Beyanname yetkili gümrük idaresine hitaben düzenlenmeli ve gümrük idaresi bilgisi açıkça yer almalıdır.'
        : 'Eşyanın gümrük bölgesine girişinde veya çıkışında beyanname verilmesi ve doğru beyan sunulması zorunludur.',
    }
  }

  if (ruleCode.startsWith('EXP-')) {
    return {
      sourceTitle: '4458 Sayılı Gümrük Kanunu',
      articleLabel: 'Madde 150-151 ve 161-194',
      excerpt: 'İhracat rejiminde eşyanın Türkiye Gümrük Bölgesi dışına çıkışında beyanname ve eki belgelerle doğru beyan sunulması zorunludur.',
    }
  }

  if (ruleCode.startsWith('CROSS-')) {
    return {
      sourceTitle: '4458 Sayılı Gümrük Kanunu',
      articleLabel: 'Madde 63 ve 76-80',
      excerpt: 'Beyan kabul edildiğinde beyanın doğruluğu, belge bütünlüğü ve eşyanın kıymeti kontrol edilir.',
    }
  }

  if (ruleCode.startsWith('PRES-')) {
    return {
      sourceTitle: '4458 Sayılı Gümrük Kanunu',
      articleLabel: 'Madde 60-62',
      excerpt: 'Gümrük beyannamesine ilişkin fatura, çeki listesi, menşe ve taşıma belgeleri beyanın tevsiki için sunulur.',
    }
  }

  return null
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
