import type { Asset, AssetDetail, AssetType, Currency } from '@/types'
import { db, type AssetRow } from './schema'
import { getExchangeRate } from './exchangeRate'

// ──────────────────────────────────────────────────────────────
// CRUD - Assets
//
// 원본 backend/db/crud.py 의 로직을 그대로 이전한다.
// 평면 저장된 assets + assetHistory + 유형별 detail 을 조인해 Asset 형태로 합성한다.
// ──────────────────────────────────────────────────────────────

/** 유형별 상세 행 조회 → assetId 를 제거한 AssetDetail 로 반환 */
async function getDetail(id: string, type: AssetType): Promise<AssetDetail | undefined> {
  let row: { assetId: string } | undefined
  switch (type) {
    case 'REAL_ESTATE': row = await db.realEstateDetails.get(id); break
    case 'STOCK':       row = await db.stockDetails.get(id);      break
    case 'PENSION':     row = await db.pensionDetails.get(id);    break
    case 'SAVINGS':     row = await db.savingsDetails.get(id);    break
    default: return undefined   // PHYSICAL / ETC 는 상세 테이블 없음
  }
  if (!row) return undefined
  const { assetId: _omit, ...detail } = row
  return detail as AssetDetail
}

/** AssetRow + 이력 + 상세 → Asset (원본 _asset_to_dict 대응) */
async function composeAsset(row: AssetRow): Promise<Asset> {
  const rows = await db.assetHistory.where('assetId').equals(row.id).toArray()
  rows.sort((a, b) => a.date.localeCompare(b.date))

  // 직전 이력 시점(전일 등락 계산용): 끝에서 2번째
  const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined

  const detail = await getDetail(row.id, row.type)
  return {
    id:               row.id,
    type:             row.type,
    name:             row.name,
    currentValue:     row.currentValue,
    previousValue:    prev?.value ?? undefined,
    previousPrice:    prev?.price ?? undefined,
    acquisitionDate:  row.acquisitionDate ?? '',
    acquisitionPrice: row.acquisitionPrice,
    disposalDate:     row.disposalDate ?? undefined,
    disposalPrice:    row.disposalPrice ?? undefined,
    quantity:         row.quantity,
    ownership:        row.ownership
                     ?? (row.type === 'REAL_ESTATE' ? (detail as { ownership?: { husband: number; wife: number } })?.ownership : undefined)
                     ?? { husband: 50, wife: 50 },
    history: rows.map((h) => ({
      date:     h.date,
      value:    h.value ?? undefined,
      price:    h.price ?? undefined,
      quantity: h.quantity ?? undefined,
    ...(h.quantitySourceDate ? { quantitySourceDate: h.quantitySourceDate } : {}),
    })),
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
    detail,
  }
}

/** 유형별 상세 저장(생성/재생성 공용). 주식 배당 필드는 미제공 시 기존값 보존. */
async function putDetail(id: string, type: AssetType, detail: Record<string, any>) {
  switch (type) {
    case 'REAL_ESTATE':
      await db.realEstateDetails.put({
        assetId:       id,
        isOwned:       !!detail.isOwned,
        hasTenant:     !!detail.hasTenant,
        tenantDeposit: detail.tenantDeposit ?? 0,
        address:       detail.address ?? '',
        loanAmount:    detail.loanAmount ?? 0,
        futureValue:   detail.futureValue,
        futureYear:    detail.futureYear,
        housingTaxStartDate: detail.housingTaxStartDate,
        constructionHoldingTaxAnnual: detail.constructionHoldingTaxAnnual,
      })
      break
    case 'STOCK': {
      // 배당 설정(yield/dps/cycle)은 별도 배당 API로 관리되므로,
      // 자산 수정으로 detail을 재생성할 때 누락되면 기존값을 유지한다.
      const existing = await db.stockDetails.get(id)
      await db.stockDetails.put({
        assetId:          id,
        accountName:      detail.accountName ?? '',
        currency:         (detail.currency ?? 'KRW') as Currency,
        isPensionLike:    !!detail.isPensionLike,
        isAccountLevel:   !!detail.isAccountLevel,
        pensionStartYear: detail.pensionStartYear,
        pensionMonthly:   detail.pensionMonthly,
        ticker:           detail.ticker,
        dividendYield:    detail.dividendYield ?? existing?.dividendYield,
        dividendDps:      detail.dividendDps   ?? existing?.dividendDps,
        dividendCycle:    detail.dividendCycle ?? existing?.dividendCycle,
      })
      break
    }
    case 'PENSION':
      await db.pensionDetails.put({
        assetId:               id,
        pensionType:           detail.pensionType,
        expectedStartYear:     detail.expectedStartYear ?? 0,
        expectedEndYear:       detail.expectedEndYear ?? 0,
        expectedMonthlyPayout: detail.expectedMonthlyPayout ?? 0,
        annualGrowthRate:      detail.annualGrowthRate ?? 0,
        hideInChart:           !!detail.hideInChart,
        linkedStockId:         detail.linkedStockId,
      })
      break
    case 'SAVINGS':
      await db.savingsDetails.put({
        assetId:          id,
        isPensionLike:    !!detail.isPensionLike,
        pensionStartYear: detail.pensionStartYear,
        pensionMonthly:   detail.pensionMonthly,
      })
      break
    // PHYSICAL / ETC: 상세 테이블 없음
  }
}

const ALL_TABLES = [
  'assets', 'assetHistory', 'realEstateDetails', 'stockDetails',
  'pensionDetails', 'savingsDetails', 'dividendHistory',
] as const

export async function getAllAssets(type?: AssetType): Promise<Asset[]> {
  const rows = type
    ? await db.assets.where('type').equals(type).toArray()
    : await db.assets.toArray()
  return Promise.all(rows.map(composeAsset))
}

export async function getAssetById(id: string): Promise<Asset | null> {
  const row = await db.assets.get(id)
  return row ? composeAsset(row) : null
}

/**
 * UUID 생성.
 * crypto.randomUUID()는 보안 컨텍스트(HTTPS/localhost)에서만 존재한다.
 * 폰 테스트처럼 일반 HTTP(Tailscale IP 등)로 접속한 비보안 컨텍스트에서는
 * undefined 이므로 Math.random 폴백을 둔다. (배포 후 HTTPS에선 네이티브 사용)
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function createAsset(data: Record<string, any>): Promise<string> {
  const id  = (data.id as string) || uuid()
  const now = new Date().toISOString()

  const type      = data.type as AssetType
  const qtyBased  = type === 'STOCK' || type === 'PHYSICAL'
  const price     = data.acquisitionPrice ?? 0
  const qty       = data.quantity ?? 0
  const currency  = (data.detail as { currency?: string } | undefined)?.currency ?? 'KRW'
  const rate      = qtyBased ? await getExchangeRate(currency) : 1
  const seedValue = qtyBased ? price * qty * rate : price   // 취득 시점 초기 평가액(KRW)

  await db.transaction('rw', ALL_TABLES, async () => {
    await db.assets.put({
      id,
      type,
      name:             data.name,
      currentValue:     data.currentValue ?? seedValue,
      acquisitionDate:  data.acquisitionDate ?? '',
      acquisitionPrice: price,
      disposalDate:     data.disposalDate ?? null,
      disposalPrice:    data.disposalPrice ?? null,
      quantity:         qty,
      ownership:        data.ownership ?? { husband: 50, wife: 50 },
      createdAt:        now,
      updatedAt:        now,
    })
    await putDetail(id, type, data.detail ?? {})

    // 초기 이력: 명시 제공이 없으면 취득일 기준으로 시딩.
    // (이걸 안 하면 타일 시세가 0, 차트도 빈 채로 시작함)
    const init = data.initialHistory
    if (init) {
      await db.assetHistory.add({
        assetId:  id,
        date:     init.date ?? data.acquisitionDate ?? '',
        value:    init.value ?? null,
        price:    init.price ?? null,
        quantity: init.quantity ?? null,
      })
    } else {
      await db.assetHistory.add({
        assetId:  id,
        date:     data.acquisitionDate ?? '',
        value:    seedValue || null,
        price:    qtyBased ? (price || null) : null,
        quantity: qtyBased ? (qty || null) : null,
      })
    }
  })

  return id
}

export async function updateAsset(id: string, data: Record<string, any>): Promise<void> {
  await db.transaction('rw', ALL_TABLES, async () => {
    const row = await db.assets.get(id)
    if (!row) return

    await db.assets.put({
      ...row,
      name:             data.name             ?? row.name,
      currentValue:     data.currentValue     ?? row.currentValue,
      acquisitionDate:  data.acquisitionDate  ?? row.acquisitionDate,
      acquisitionPrice: data.acquisitionPrice ?? row.acquisitionPrice,
      disposalDate:     data.disposalDate     ?? row.disposalDate,
      // 매각일과 함께 저장하면 매각가는 그대로 반영 — 빈칸(undefined)도 "미입력"으로 비운다(기존 값 유지 X)
      disposalPrice:    data.disposalDate && 'disposalPrice' in data ? data.disposalPrice : data.disposalPrice ?? row.disposalPrice,
      quantity:         data.quantity         ?? row.quantity,
      ownership:        data.ownership        ?? row.ownership ?? { husband: 50, wife: 50 },
      updatedAt:        new Date().toISOString(),
    })

    // detail 키가 있을 때만 상세 재생성 (type 은 변경 불가)
    if ('detail' in data) {
      await putDetail(id, row.type, data.detail ?? {})
    }
  })
}

export async function deleteAsset(id: string): Promise<void> {
  await db.transaction('rw', ALL_TABLES, async () => {
    await db.assets.delete(id)
    await db.assetHistory.where('assetId').equals(id).delete()
    await db.realEstateDetails.delete(id)
    await db.stockDetails.delete(id)
    await db.pensionDetails.delete(id)
    await db.savingsDetails.delete(id)
    await db.dividendHistory.where('assetId').equals(id).delete()
  })
}
