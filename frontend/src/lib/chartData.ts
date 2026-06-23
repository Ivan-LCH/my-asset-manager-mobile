import type { Asset, ChartDataPoint, RealEstateDetail } from '@/types'
import { TYPE_LABELS } from './utils'

// ──────────────────────────────────────────────────────────────
// 차트 집계 (Forward Fill) — 원본 backend/db/crud.py 의
// generate_chart_data / _asset_to_records / _get_label 를 순수 JS로 이식.
//
// pandas pivot → reindex(daily) → ffill → fillna(0) → slice → melt → groupby.sum
// 흐름을 그대로 재현한다. 외부 의존(Dexie 등) 없이 순수 함수로 두어 단위 테스트가 가능하다.
//
// 날짜 연산은 DST/타임존 영향을 피하기 위해 UTC 자정 기준 "일(day) 정수"로 처리한다.
// ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** 'YYYY-MM-DD' → UTC 기준 일(day) 정수 */
function toDayNum(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

/** 일(day) 정수 → 'YYYY-MM-DD' */
function fromDayNum(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** 오늘(로컬 달력 날짜)의 'YYYY-MM-DD' */
function todayStr(): string {
  const n = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

const PERIOD_DAYS: Record<string, number> = {
  '10y': 3650, '3y': 1095, '1y': 365, '3m': 90, '1m': 30,
}

interface Record_ { assetId: string; date: string; value: number }

/**
 * 자산 하나의 이력 포인트를 레코드 리스트로 변환 (원본 _asset_to_records).
 * 부동산은 부채(대출 + 보증금)를 차감한 순자산 기준.
 */
function assetToRecords(asset: Asset, today: string): Record_[] {
  const aId   = asset.id
  const aType = asset.type
  const history = asset.history ?? []

  // 부동산 부채
  let liab = 0
  if (aType === 'REAL_ESTATE' && asset.detail) {
    const d = asset.detail as RealEstateDetail
    liab = (d.loanAmount || 0) + (d.tenantDeposit || 0)
  }

  const records: Record_[] = []

  // (1) 취득일 초기값
  const acqDate  = (asset.acquisitionDate || '2023-01-01').slice(0, 10)
  const acqPrice = asset.acquisitionPrice || 0
  const qty      = asset.quantity || 0
  const initVal  = ((aType === 'STOCK' || aType === 'PHYSICAL') && qty) ? acqPrice * qty : acqPrice
  records.push({ assetId: aId, date: acqDate, value: Math.max(0, initVal - liab) })

  // (2) 이력
  for (const h of history) {
    if (!h.date) continue
    let val: number
    if (h.value != null) val = h.value
    else if (h.price != null && h.quantity != null) val = h.price * h.quantity
    else continue
    records.push({ assetId: aId, date: h.date.slice(0, 10), value: Math.max(0, val - liab) })
  }

  // (3) 현재값 or 매각값
  if (asset.disposalDate) {
    // 매각 시점에 즉시 0 처리 (매각 손익은 별도 KPI로 표현)
    records.push({ assetId: aId, date: asset.disposalDate.slice(0, 10), value: 0 })
  } else {
    const cur = asset.currentValue || 0
    records.push({ assetId: aId, date: today, value: Math.max(0, cur - liab) })
  }

  return records
}

/** group_by 기준 라벨 (원본 _get_label) */
function getLabel(asset: Asset, groupBy: string): string {
  if (groupBy === 'name') return asset.name ?? ''
  if (groupBy === 'account') {
    const accountName = (asset.detail as { accountName?: string } | undefined)?.accountName
    return accountName || asset.name || '기타'
  }
  return TYPE_LABELS[asset.type] ?? asset.type
}

/**
 * 이력 데이터를 Forward Fill 하여 날짜별 자산 가치를 집계한다.
 * @param period   all | 10y | 3y | 1y | 3m | 1m
 * @param groupBy  type | name | account
 */
export function generateChartData(
  assets: Asset[],
  period = 'all',
  groupBy = 'type',
): ChartDataPoint[] {
  const today    = todayStr()
  const todayNum = toDayNum(today)
  const startNum = period in PERIOD_DAYS
    ? todayNum - PERIOD_DAYS[period]
    : toDayNum('2015-01-01')

  // 레코드 수집 (hideInChart 자산 제외)
  const metaById = new Map<string, Asset>()
  const records: Record_[] = []
  for (const asset of assets) {
    metaById.set(asset.id, asset)
    if ((asset.detail as { hideInChart?: boolean } | undefined)?.hideInChart) continue
    records.push(...assetToRecords(asset, today))
  }
  if (records.length === 0) return []

  // 자산별 (날짜→값) 맵. 같은 (assetId, date) 중복은 마지막 값 우선(keep='last').
  // 미래 날짜(오늘 이후)는 reindex(end=today)에서 제외되므로 버린다.
  const perAsset = new Map<string, Map<number, number>>()
  let histMin = Infinity
  for (const r of records) {
    const dnum = toDayNum(r.date)
    if (dnum > todayNum) continue
    if (dnum < histMin) histMin = dnum
    let m = perAsset.get(r.assetId)
    if (!m) { m = new Map(); perAsset.set(r.assetId, m) }
    m.set(dnum, r.value)
  }

  // 전체 이력 범위로 ffill 후 start 이후 슬라이싱하기 위한 시작점
  const fullStart = Math.min(histMin === Infinity ? startNum : histMin, startNum)

  // 자산별로 일 단위 forward-fill 하며 (날짜, 라벨)별 합산
  const byDay = new Map<number, Map<string, number>>()
  for (const [assetId, m] of perAsset) {
    const asset = metaById.get(assetId)
    if (!asset) continue
    const label = getLabel(asset, groupBy)
    const sortedDays = [...m.keys()].sort((a, b) => a - b)

    let lastVal = 0   // 첫 레코드 이전 = NaN → fillna(0)
    let si = 0
    for (let day = fullStart; day <= todayNum; day++) {
      if (si < sortedDays.length && sortedDays[si] === day) {
        lastVal = m.get(sortedDays[si])!
        si++
      }
      if (day >= startNum) {
        let dm = byDay.get(day)
        if (!dm) { dm = new Map(); byDay.set(day, dm) }
        dm.set(label, (dm.get(label) ?? 0) + lastVal)
      }
    }
  }

  // 날짜 → 라벨 정렬하여 출력
  const out: ChartDataPoint[] = []
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const dateStr = fromDayNum(day)
    const dm = byDay.get(day)!
    for (const label of [...dm.keys()].sort((a, b) => a.localeCompare(b))) {
      out.push({ date: dateStr, label, value: dm.get(label)! })
    }
  }
  return out
}
