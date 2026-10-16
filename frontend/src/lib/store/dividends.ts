import type { DividendRecord, DividendSummary } from '@/types'
import { db } from './schema'
import { getExchangeRate } from './exchangeRate'

// ──────────────────────────────────────────────────────────────
// Dividends — 원본 api/dividends.py
// ──────────────────────────────────────────────────────────────
const CYCLE_MAP: Record<string, number> = { '월': 12, '분기': 4, '반기': 2, '연간': 1 }

export async function getDividends(assetId: string): Promise<DividendRecord[]> {
  const rows = await db.dividendHistory.where('assetId').equals(assetId).toArray()
  rows.sort((a, b) => b.date.localeCompare(a.date))   // 날짜 내림차순
  return rows.map((r) => ({
    id:             r.id!,
    assetId:        r.assetId,
    date:           r.date,
    amountKrw:      r.amountKrw,
    amountOriginal: r.amountOriginal,
    currency:       r.currency,
    exchangeRate:   r.exchangeRate,
    memo:           r.memo,
  }))
}

export async function addDividend(
  assetId: string,
  data: Omit<DividendRecord, 'id' | 'assetId'>,
): Promise<number> {
  const id = await db.dividendHistory.add({
    assetId,
    date:           data.date,
    amountKrw:      data.amountKrw,
    amountOriginal: data.amountOriginal ?? 0,
    currency:       data.currency ?? 'KRW',
    exchangeRate:   data.exchangeRate ?? 1,
    memo:           data.memo ?? '',
  })
  return id as number
}

export async function removeDividend(assetId: string, id: number): Promise<void> {
  const row = await db.dividendHistory.get(id)
  if (row && row.assetId === assetId) await db.dividendHistory.delete(id)
}

export async function updateDividendSettings(
  assetId: string,
  data: { dividendYield?: number; dividendDps?: number; dividendCycle?: string },
): Promise<void> {
  const detail = await db.stockDetails.get(assetId)
  if (!detail) return
  if (data.dividendYield !== undefined) detail.dividendYield = Number(data.dividendYield) || 0
  if (data.dividendDps   !== undefined) detail.dividendDps   = Number(data.dividendDps) || 0
  if (data.dividendCycle !== undefined) detail.dividendCycle = data.dividendCycle
  await db.stockDetails.put(detail)
}

/** 계좌/종목별 연간 예상 배당금 집계 (stockDetails 기반). 원본 get_all_dividends_summary */
export async function getDividendSummary(): Promise<DividendSummary> {
  const stocks = await db.assets.where('type').equals('STOCK').toArray()
  const items: DividendSummary['items'] = []

  for (const a of stocks) {
    if (a.disposalDate) continue
    const sd = await db.stockDetails.get(a.id)
    if (!sd) continue

    const rate  = await getExchangeRate(sd.currency || 'KRW')
    const qty   = a.quantity || 0
    const val   = a.currentValue || 0
    const dy    = sd.dividendYield || 0
    const dps   = sd.dividendDps || 0       // 주당 배당금 (이미 KRW 환산)
    const cycle = sd.dividendCycle || '연간'
    const times = CYCLE_MAP[cycle] ?? 1

    // DPS 우선, 없으면 수익률로 계산 (둘 다 KRW 기준이라 rate는 표시용으로만 사용)
    let annualKrw = 0
    if (dps > 0) annualKrw = dps * qty * times
    else if (dy > 0) annualKrw = (val * dy) / 100

    items.push({
      assetId:       a.id,
      name:          a.name,
      accountName:   sd.accountName,
      currency:      sd.currency,
      exchangeRate:  rate,
      dividendYield: dy,
      dividendDps:   dps,
      dividendCycle: cycle,
      annualKrw,
      monthlyKrw:    annualKrw / 12,
    })
  }

  return {
    items,
    totalAnnual:  items.reduce((s, i) => s + i.annualKrw, 0),
    totalMonthly: items.reduce((s, i) => s + i.monthlyKrw, 0),
  }
}
