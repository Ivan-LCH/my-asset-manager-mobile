import type { ChartDataPoint, ChartParams, HistoryItem } from '@/types'
import { generateChartData } from '../chartData'
import { db } from './schema'
import { getExchangeRate } from './exchangeRate'
import { getAllAssets } from './assets'

// ──────────────────────────────────────────────────────────────
// CRUD - History
// ──────────────────────────────────────────────────────────────

/** 최신 이력 기준으로 assets.currentValue / quantity 동기화 (원본 _sync_asset_value) */
async function syncAssetValue(assetId: string): Promise<void> {
  const rows = await db.assetHistory.where('assetId').equals(assetId).toArray()
  if (rows.length === 0) return
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const latest = rows[rows.length - 1]

  const asset = await db.assets.get(assetId)
  if (!asset) return
  asset.currentValue = latest.value ?? 0
  asset.quantity     = latest.quantity ?? asset.quantity
  asset.updatedAt    = new Date().toISOString()
  await db.assets.put(asset)
}

export async function getHistory(assetId: string): Promise<HistoryItem[]> {
  const rows = await db.assetHistory.where('assetId').equals(assetId).toArray()
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows.map((h) => ({
    date:     h.date,
    value:    h.value ?? undefined,
    price:    h.price ?? undefined,
    quantity: h.quantity ?? undefined,
    ...(h.quantitySourceDate ? { quantitySourceDate: h.quantitySourceDate } : {}),
  }))
}

/**
 * 이력 추가 (원본 add_history + value 계산/currentValue 동기화 보강).
 * - value 없고 price·수량 있으면 price*수량*환율로 자동 계산
 * - 추가 후 최신 이력 기준으로 currentValue 동기화 → 타일 시세에 즉시 반영
 * - 마지막 기록과의 갭이 31일 이하면 빈 날짜를 직전값으로 백필
 */
export async function addHistory(assetId: string, data: HistoryItem): Promise<void> {
  const stock = await db.stockDetails.get(assetId)
  const rate  = await getExchangeRate(stock?.currency ?? 'KRW')

  await db.transaction('rw', ['assetHistory', 'assets'], async () => {
    let value = data.value
    if (value == null && data.price != null && data.quantity != null) {
      value = data.price * data.quantity * rate
    }
    if (await db.assetHistory.where('[assetId+date]').equals([assetId,data.date]).count()) throw new Error('이미 기록된 날짜입니다. 해당 이력을 수정해 주세요.')
    await db.assetHistory.add({
      assetId,
      date:     data.date,
      value:    value ?? null,
      price:    data.price ?? null,
      quantity: data.quantity ?? null,
    })
    await syncAssetValue(assetId)
  })
}

/**
 * 이력 수정 (원본 update_history + history.py 의 환율 결정 로직 통합).
 * - value 없으면 price * quantity * 환율로 자동 계산
 * - 수량 변경 시 해당 날짜 이후 모든 이력에 수량 전파 (price 있으면 value 재계산)
 * - 종료 후 currentValue / quantity 동기화
 * @returns 전파된 이후 이력 행 수
 */
export async function updateHistory(
  assetId: string,
  date: string,
  data: Partial<HistoryItem>,
): Promise<number> {
  // 해당 자산이 주식이면 통화 → 환율 (그 외 KRW=1)
  const stock = await db.stockDetails.get(assetId)
  const rate  = await getExchangeRate(stock?.currency ?? 'KRW')

  let propagated = 0

  await db.transaction('rw', ['assetHistory', 'assets'], async () => {
    const existing = await db.assetHistory
      .where('[assetId+date]').equals([assetId, date]).first()

    const newPrice    = data.price
    const newQuantity = data.quantity
    let   newValue    = data.value

    if (newValue == null && newPrice != null && newQuantity != null) {
      newValue = newPrice * newQuantity * rate
    }

    if (!existing) {
      // 신규 추가 (upsert) — 이전 기록과의 빈 날짜 백필(31일 이하 갭)
      // Missing observations remain missing; continuous chart display is read-only.
      await db.assetHistory.add({
        assetId,
        date,
        value:    newValue ?? null,
        price:    newPrice ?? null,
        quantity: newQuantity ?? null,
      })
    } else {
      const oldQty = existing.quantity
      await db.assetHistory.put({
        ...existing,
        quantitySourceDate: newQuantity != null ? undefined : existing.quantitySourceDate,
        price:    newPrice    != null ? newPrice    : existing.price,
        quantity: newQuantity != null ? newQuantity : existing.quantity,
        value:    newValue    != null ? newValue    : existing.value,
      })

      // A correction is scoped to this date. Later actual trades are independent.
    }

    await syncAssetValue(assetId)
  })

  return propagated
}

export async function deleteHistory(assetId: string, date: string): Promise<void> {
  await db.transaction('rw', ['assetHistory', 'assets'], async () => {
    await db.assetHistory.where('[assetId+date]').equals([assetId, date]).delete()
    await syncAssetValue(assetId)
  })
}

// ──────────────────────────────────────────────────────────────
// 차트 (원본 api/assets.py 의 asset_chart 대응)
// 자산 조회 → account 필터 → ffill 집계
// ──────────────────────────────────────────────────────────────
export async function getChartData(params: ChartParams): Promise<ChartDataPoint[]> {
  let assets = await getAllAssets(params.type)
  if (params.account) {
    assets = assets.filter(
      (a) => (a.detail as { accountName?: string } | undefined)?.accountName === params.account,
    )
  }
  return generateChartData(assets, params.period ?? 'all', params.group_by ?? 'type')
}
