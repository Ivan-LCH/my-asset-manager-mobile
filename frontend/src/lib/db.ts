import Dexie, { type Table } from 'dexie'
import type {
  Asset, AssetDetail, AssetType, ChartDataPoint, ChartParams, Currency, HistoryItem,
  DividendRecord, DividendSummary, RetirementPlan, CorpSimPlan, PensionSimPlan,
  PortfolioHolding, PortfolioSettings, Settings, LumpsumItem,
} from '@/types'
import { generateChartData } from './chartData'
import { fetchStockHistory } from './stockPrice'
import { validateBackup } from '@/planner/backup'
import { fingerprint } from '@/planner/model'
import {backupSummary,backupReplacementWarnings} from './backupInfo'

// ──────────────────────────────────────────────────────────────
// IndexedDB 스키마 (Dexie)
//
// 원본 SQLite 스키마를 그대로 이전하되, 저장 형태를 camelCase로 통일한다.
// (원본 백엔드는 snake_case ↔ camelCase 변환 레이어가 있었으나 로컬 DB에서는 불필요)
//
// assets 는 평면 저장(이력/상세는 별도 테이블), 조회 시 조인하여 Asset 형태로 합성한다.
// 자산 유형 중 상세 테이블이 있는 것은 REAL_ESTATE / STOCK / PENSION / SAVINGS 뿐이며,
// PHYSICAL / ETC 는 상세 테이블이 없다(원본과 동일).
// ──────────────────────────────────────────────────────────────

export interface AssetRow {
  id:               string
  type:             AssetType
  name:             string
  currentValue:     number
  acquisitionDate:  string | null // legacy backup: not entered
  acquisitionPrice: number
  disposalDate?:    string | null
  disposalPrice?:   number | null
  quantity:         number
  ownership?:       { husband: number; wife: number }  // 구버전 미존재 시 50:50
  createdAt:        string
  updatedAt:        string
}

export interface HistoryRow {
  id?:       number      // auto-increment
  assetId:   string
  date:      string      // YYYY-MM-DD
  value?:    number | null  // 평가액 (KRW, 환율 적용 후)
  price?:    number | null  // 단가 (주식/실물자산용, 원래 통화)
  quantity?: number | null  // 수량 (주식/실물자산용)
  quantitySourceDate?: string // 빈 거래일: 이 날짜의 기록 수량을 유지했다고 가정
}

export interface RealEstateRow {
  assetId:       string
  isOwned:       boolean
  hasTenant:     boolean
  tenantDeposit: number
  address:       string
  loanAmount:    number
  futureValue?:  number
  futureYear?:   number
  housingTaxStartDate?: string
  constructionHoldingTaxAnnual?: number
}

export interface StockRow {
  assetId:           string
  accountName:       string
  currency:          Currency
  isPensionLike:     boolean
  isAccountLevel?:   boolean
  pensionStartYear?: number
  pensionMonthly?:   number
  ticker?:           string
  dividendYield?:    number   // 배당수익률 (%)
  dividendDps?:      number   // 주당 배당금 (KRW 환산)
  dividendCycle?:    string   // 월|분기|반기|연간
}

export interface PensionRow {
  assetId:               string
  pensionType?:          string
  expectedStartYear:     number
  expectedEndYear:       number
  expectedMonthlyPayout: number
  annualGrowthRate:      number
  hideInChart?:          boolean
  linkedStockId?:        string
}

export interface SavingsRow {
  assetId:           string
  isPensionLike:     boolean
  pensionStartYear?: number
  pensionMonthly?:   number
}

export interface DividendRow {
  id?:            number    // auto-increment
  assetId:        string
  date:           string    // YYYY-MM-DD
  amountKrw:      number
  amountOriginal: number
  currency:       string
  exchangeRate:   number
  memo:           string
}

export interface SettingRow {
  key:   string
  value: string             // 항상 문자열로 직렬화 저장 (원본 settings 테이블과 동일)
}

// ──────────────────────────────────────────────────────────────
// Dexie DB 정의
// ──────────────────────────────────────────────────────────────
export class AssetDB extends Dexie {
  assets!:            Table<AssetRow, string>
  assetHistory!:      Table<HistoryRow, number>
  realEstateDetails!: Table<RealEstateRow, string>
  stockDetails!:      Table<StockRow, string>
  pensionDetails!:    Table<PensionRow, string>
  savingsDetails!:    Table<SavingsRow, string>
  dividendHistory!:   Table<DividendRow, number>
  settings!:          Table<SettingRow, string>

  constructor() {
    super(isDemoDatabase ? 'asset_manager_m_demo' : 'asset_manager_m')

    // 인덱싱 대상만 선언 (나머지 필드는 자유 저장)
    this.version(1).stores({
      assets:            'id, type',
      assetHistory:      '++id, assetId, [assetId+date]',
      realEstateDetails: 'assetId',
      stockDetails:      'assetId',
      pensionDetails:    'assetId',
      savingsDetails:    'assetId',
      dividendHistory:   '++id, assetId, date',
      settings:          'key',
    })
    // Additive upgrade only: original assets/history are never rewritten here.
    this.version(2).stores({
      plannerPlans: 'id', plannerRuns: 'id,createdAt', plannerDrafts: 'id', plannerRecovery: 'id,createdAt',
    })
  }
}

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') window.sessionStorage.setItem('myasset-demo', '1')
export const isDemoDatabase = typeof window !== 'undefined' && window.sessionStorage.getItem('myasset-demo') === '1'
export const db = new AssetDB()

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
      disposalPrice:    data.disposalPrice    ?? row.disposalPrice,
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

// ──────────────────────────────────────────────────────────────
// 환율
//
// 백엔드(frankfurter/yfinance)가 사라졌으므로, settings 에 캐시된
// `exchange_rate_<통화>` 값을 우선 사용하고, 없으면 기본값으로 대체한다.
// (원본 dividends.py 의 COALESCE 로직과 동일)
// ──────────────────────────────────────────────────────────────
export const FALLBACK_RATES: Record<string, number> = { USD: 1450, JPY: 9.5 }

export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === 'KRW') return 1
  const row = await db.settings.get(`exchange_rate_${currency}`)
  if (row) {
    const n = parseFloat(row.value)
    if (!Number.isNaN(n) && n > 0) return n
  }
  return FALLBACK_RATES[currency] ?? 1
}

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
 * 이력 빈 날짜 백필 — 마지막 기록일과 새 기록일 사이의 빈 날짜를
 * 직전 기록값으로 채운다. 갭이 31일 이하일 때만 (한 달 이상 비면 임의 생성 안 함).
 * 호출부의 transaction 안에서 실행해야 원자성이 보장된다.
 */
const MAX_BACKFILL_DAYS = 31

async function backfillGaps(assetId: string, newDate: string): Promise<number> {
  const rows = await db.assetHistory.where('assetId').equals(assetId).toArray()
  const prev = rows
    .filter((r) => r.date < newDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!prev) return 0

  const start = new Date(prev.date + 'T00:00:00')
  const end   = new Date(newDate + 'T00:00:00')
  const gapDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (gapDays <= 1 || gapDays > MAX_BACKFILL_DAYS) return 0

  const have = new Set(rows.map((r) => r.date))
  const fmt  = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const fills: { assetId: string; date: string; value: number | null; price: number | null; quantity: number | null }[] = []
  for (let i = 1; i < gapDays; i++) {
    const dt = new Date(start)
    dt.setDate(dt.getDate() + i)
    const ds = fmt(dt)
    if (have.has(ds)) continue
    fills.push({
      assetId,
      date:     ds,
      value:    prev.value ?? null,
      price:    prev.price ?? null,
      quantity: prev.quantity ?? null,
    })
  }
  if (fills.length > 0) await db.assetHistory.bulkAdd(fills)
  return fills.length
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

// ──────────────────────────────────────────────────────────────
// Settings (KV) — 원본 crud.py get_settings / save_settings
// ──────────────────────────────────────────────────────────────

/** 저장값(문자열) → 숫자/문자열 (원본: "." 포함이면 float, 아니면 int, 실패 시 문자열) */
function parseSettingValue(val: string): number | string {
  if (val.trim() === '') return val
  const n = Number(val)
  if (Number.isNaN(n)) return val
  return val.includes('.') ? n : (Number.isInteger(n) ? n : val)
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const out: Record<string, number | string> = {}
  for (const { key, value } of rows) out[key] = parseSettingValue(value)
  return out as Settings
}

export async function saveSettings(data: Record<string, unknown>): Promise<void> {
  await db.transaction('rw', 'settings', async () => {
    for (const [key, val] of Object.entries(data)) {
      await db.settings.put({ key, value: String(val) })
    }
  })
}

// ──────────────────────────────────────────────────────────────
// Retirement — 원본 api/retirement.py (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
const RETIREMENT_KEY = 'retirement_plan'

export async function getRetirement(): Promise<RetirementPlan> {
  const row = await db.settings.get(RETIREMENT_KEY)
  if (!row) return {} as RetirementPlan
  try {
    return JSON.parse(row.value) as RetirementPlan
  } catch {
    return {} as RetirementPlan
  }
}

export async function saveRetirement(data: Partial<RetirementPlan>): Promise<void> {
  // 화면에서 편집한 필드만 최신 저장본에 병합한다. 읽기와 쓰기를 하나의
  // 트랜잭션으로 묶어 다른 섹션의 설정이 오래된 폼 값으로 사라지지 않게 한다.
  await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get(RETIREMENT_KEY)
    const previous = row ? JSON.parse(row.value) as Partial<RetirementPlan> : {}
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
      throw new Error('저장된 은퇴계획을 읽을 수 없습니다. 원본을 백업한 뒤 확인해 주세요.')
    }
    // 키 생략은 보존, 명시적 undefined는 해당 선택값 삭제로 구분한다.
    await db.settings.put({ key: RETIREMENT_KEY, value: JSON.stringify({ ...previous, ...data }) })
  })
}

/** Quote observations never carry a stale quantity or rewrite later history. */
export async function beginQuoteRequest(assetIds: string[], requestId: string) {
  await db.transaction('rw', db.settings, async () => {
    for (const id of assetIds) await db.settings.put({key:'quote-request:'+id,value:requestId})
  })
}
export async function applyQuoteObservation(assetId:string,ticker:string,price:number|null,date:string,requestId:string):Promise<boolean> {
  return db.transaction('rw', db.assets, db.stockDetails, db.assetHistory, db.settings, async () => {
    if ((await db.settings.get('quote-request:'+assetId))?.value !== requestId) return false
    const a=await db.assets.get(assetId), stock=await db.stockDetails.get(assetId)
    let reason=''
    if (!a || a.type!=='STOCK' || a.disposalDate) reason='처분되었거나 존재하지 않는 종목'
    else if(stock?.ticker!==ticker || stock?.isAccountLevel) reason='티커/계좌 입력이 변경되어 재조회 필요'
    else if(price===null || !Number.isFinite(price) || price<=0) reason='시세 조회 실패 — 기존 평가액 유지'
    else if((await db.assetHistory.where('assetId').equals(assetId).toArray()).some(h=>h.date>date)) reason='미래 이력이 있어 확인 필요'
    const observedAt=new Date().toISOString()
    await db.settings.put({key:'quote-status:'+assetId,value:JSON.stringify({observedAt,ok:!reason,reason,marketTimestamp:null})})
    if(reason || !a || price===null)return false
    const rate=await getExchangeRate(stock?.currency??'KRW'),value=price*a.quantity*rate
    const existing=await db.assetHistory.where('[assetId+date]').equals([assetId,date]).first()
    await db.assetHistory.put({...existing,assetId,date,price,quantity:a.quantity,value})
    await db.assets.update(assetId,{currentValue:value,updatedAt:observedAt})
    return true
  })
}

// ──────────────────────────────────────────────────────────────
// 투자법인 시뮬레이터 (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
const CORP_SIM_KEY = 'corp_sim_plan'

export async function getCorpSim(): Promise<CorpSimPlan | null> {
  const row = await db.settings.get(CORP_SIM_KEY)
  if (!row) return null
  try {
    return JSON.parse(row.value) as CorpSimPlan
  } catch {
    return null
  }
}

export async function saveCorpSim(data: CorpSimPlan): Promise<void> {
  await db.settings.put({ key: CORP_SIM_KEY, value: JSON.stringify(data) })
}

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

// ──────────────────────────────────────────────────────────────
// 백업 / 복원 (M-3)
// 로컬(IndexedDB) 저장 데이터를 JSON 으로 내보내기/가져오기.
// 폰 교체·앱 데이터 삭제 대비. 모든 테이블을 통째로 직렬화한다.
// ──────────────────────────────────────────────────────────────
export interface BackupData {
  app:         'asset_manager_m'
  version:     1 | 2
  exportedAt:  string
  tables:      Record<string, unknown[]>
}

/** 모든 테이블 스냅샷 → 백업 객체 */
export async function exportBackup(): Promise<BackupData> {
  return db.transaction('r', db.tables, async () => {
    const tables: Record<string, unknown[]> = {}
    for (const t of db.tables.filter(t => t.name !== 'plannerRecovery')) tables[t.name] = await t.toArray()
    return { app: 'asset_manager_m', version: 2, exportedAt: new Date().toISOString(), tables }
  })
}

/** 백업 객체 → 기존 데이터 전체 교체(모든 테이블 clear 후 bulkAdd) */
export async function previewBackup(data: unknown) {
  const validated = validateBackup(data), current = await exportBackup()
  const warnings=backupReplacementWarnings(current,validated)
  return { data: validated, expected: fingerprint(current.tables), warnings, summary: backupSummary(validated)+(warnings.length?'\n\n확인 필요:\n'+warnings.join('\n'):'') }
}
export async function importBackup(data: BackupData, expected?: string, sourceName?:string): Promise<void> {
  const validated = validateBackup(data)
  await db.transaction('rw', db.tables, async () => {
    const previous = await exportBackup()
    if (expected && expected !== fingerprint(previous.tables)) throw new Error('미리보기 이후 데이터가 변경되었습니다. 다시 검토해 주세요.')
    await db.table('plannerRecovery').put({ id: 'before-import', createdAt: new Date().toISOString(), backup: previous })
    for (const t of db.tables.filter(t => t.name !== 'plannerRecovery')) {
      await t.clear()
      const rows = validated.tables[t.name]
      if (rows && rows.length > 0) await t.bulkAdd(rows as Record<string, unknown>[])
    }
    await db.table('plannerRecovery').put({id:'last-import',sourceName:sourceName??'백업 파일',importedAt:new Date().toISOString(),exportedAt:validated.exportedAt,summary:backupSummary(validated)})
  })
}
export async function getLastBackupImport():Promise<{sourceName:string;importedAt:string;exportedAt:string;summary:string}|null>{
  return (await db.table('plannerRecovery').get('last-import'))??null
}
export async function restorePreviousImport() {
  const row = await db.table('plannerRecovery').get('before-import')
  if (!row) throw new Error('이 브라우저에 복원 직전 사본이 없습니다.')
  await importBackup(row.backup,undefined,'직전 사본 복구')
}

// ──────────────────────────────────────────────────────────────
// 전체 삭제 / 샘플 데이터 시드
// 처음 실행(빈 DB) 시 샘플을 채워 대시보드/차트가 바로 보이게 한다.
// ──────────────────────────────────────────────────────────────

/** 모든 테이블 비우기 */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
}

/** createAsset 으로 자산을 만들고, hist 의 이력을 순차 추가(자동 currentValue 동기화) */
async function seedAsset(
  data: Record<string, any>,
  hist: HistoryItem[] = [],
): Promise<string> {
  const id = await createAsset(data)
  for (const h of hist) await addHistory(id, h)
  return id
}

/**
 * 샘플 데이터 시드 (한국 개인 자산 예시).
 * 부동산·주식(국내/해외, 2계좌)·연금·예적금·실물.
 */
export async function seedSampleData(): Promise<void> {
  // 부동산
  await seedAsset(
    {
      type: 'REAL_ESTATE', name: '강남 자가 아파트',
      acquisitionDate: '2019-03-15', acquisitionPrice: 900_000_000,
      detail: { address: '서울특별시 강남구', loanAmount: 300_000_000, tenantDeposit: 0, isOwned: true, hasTenant: false },
    },
    [
      { date: '2021-06-30', value: 1_050_000_000 },
      { date: '2023-06-30', value: 1_200_000_000 },
      { date: '2025-06-30', value: 1_350_000_000 },
    ],
  )

  // 주식 — 키움증권 계좌
  await seedAsset(
    {
      type: 'STOCK', name: '삼성전자',
      acquisitionDate: '2020-01-10', acquisitionPrice: 55_000, quantity: 200,
      detail: { accountName: '키움증권', currency: 'KRW', ticker: '005930.KS', isPensionLike: false },
    },
    [
      { date: '2022-03-01', price: 75_000, quantity: 200 },
      { date: '2024-01-02', price: 80_000, quantity: 200 },
      { date: '2025-06-02', price: 95_000, quantity: 200 },
    ],
  )
  await seedAsset(
    {
      type: 'STOCK', name: 'Apple',
      acquisitionDate: '2020-06-01', acquisitionPrice: 130, quantity: 20,
      detail: { accountName: '키움증권', currency: 'USD', ticker: 'AAPL', isPensionLike: false },
    },
    [
      { date: '2022-06-01', price: 150, quantity: 20 },
      { date: '2024-06-01', price: 220, quantity: 20 },
      { date: '2025-06-01', price: 300, quantity: 20 },
    ],
  )

  // 주식 — NH증권 계좌
  await seedAsset(
    {
      type: 'STOCK', name: '에코프로',
      acquisitionDate: '2021-02-01', acquisitionPrice: 300_000, quantity: 30,
      detail: { accountName: 'NH증권', currency: 'KRW', ticker: '086520.KS', isPensionLike: false },
    },
    [
      { date: '2023-02-01', price: 700_000, quantity: 30 },
      { date: '2024-06-01', price: 400_000, quantity: 30 },
      { date: '2025-06-01', price: 350_000, quantity: 30 },
    ],
  )

  // 연금
  await seedAsset(
    {
      type: 'PENSION', name: '국민연금',
      acquisitionDate: '2010-01-01', acquisitionPrice: 20_000_000,
      detail: { pensionType: '국민연금', expectedStartYear: 2035, expectedEndYear: 2055, expectedMonthlyPayout: 1_200_000, annualGrowthRate: 2 },
    },
    [
      { date: '2016-12-31', value: 30_000_000 },
      { date: '2020-12-31', value: 45_000_000 },
      { date: '2025-06-30', value: 60_000_000 },
    ],
  )
  await seedAsset(
    {
      type: 'PENSION', name: '퇴직연금(IRP)',
      acquisitionDate: '2015-01-01', acquisitionPrice: 15_000_000,
      detail: { pensionType: '퇴직연금', expectedStartYear: 2040, expectedEndYear: 2060, expectedMonthlyPayout: 1_500_000, annualGrowthRate: 3 },
    },
    [
      { date: '2020-12-31', value: 18_000_000 },
      { date: '2023-12-31', value: 22_000_000 },
      { date: '2025-06-30', value: 25_000_000 },
    ],
  )

  // 예적금
  await seedAsset(
    {
      type: 'SAVINGS', name: '주택청약종금예금',
      acquisitionDate: '2022-01-01', acquisitionPrice: 5_000_000,
      detail: { isPensionLike: false },
    },
    [
      { date: '2023-06-30', value: 9_000_000 },
      { date: '2024-12-31', value: 13_000_000 },
      { date: '2025-06-30', value: 15_000_000 },
    ],
  )

  // 실물 (금)
  await seedAsset(
    {
      type: 'PHYSICAL', name: '금 100g (순금)',
      acquisitionDate: '2020-01-01', acquisitionPrice: 60_000, quantity: 100,
    },
    [
      { date: '2022-06-01', price: 75_000, quantity: 100 },
      { date: '2024-06-01', price: 95_000, quantity: 100 },
      { date: '2025-06-01', price: 130_000, quantity: 100 },
    ],
  )

  // 기본 환율(USD) — 배당/해외주식 표시용
  await saveSettings({ exchange_rate_USD: '1380' })
}

// ──────────────────────────────────────────────────────────────
// 연금 시뮬레이터 (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
const PENSION_SIM_KEY = 'pension_sim_plan'

export async function getPensionSim(): Promise<PensionSimPlan | null> {
  const row = await db.settings.get(PENSION_SIM_KEY)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    // 마이그레이션: 구 stockBalance/stockDividendYield → holdings/yields/ownership
    const legacy = parsed as { stockBalance?: number; stockDividendYield?: number; stockHoldings?: unknown }
    if (legacy.stockBalance !== undefined && legacy.stockHoldings === undefined) {
      parsed.stockHoldings = []
      parsed.stockYields = []
      parsed.stockOwnership = { husband: 50, wife: 50 }
      delete (parsed as { stockBalance?: number }).stockBalance
      delete (parsed as { stockDividendYield?: number }).stockDividendYield
    }
    // 마이그레이션: 종목 기반(stockHoldings/stockYields/stockGrowthRate) → 계좌 단위 stockAccount(남편/와이프)
    // 종목별 가중평균 배당률·상승률을 계좌 기본값으로 승계. extraAmount=0.
    const legacyHoldings = parsed as {
      stockHoldings?: { ticker?: string; weight?: number; growthRate?: number }[]
      stockYields?: { ticker?: string; yield?: number; manual?: boolean }[]
      stockGrowthRate?: number; stockManualYield?: number; stockAccount?: unknown
    }
    if (legacyHoldings.stockHoldings !== undefined && legacyHoldings.stockAccount === undefined) {
      const holdings = legacyHoldings.stockHoldings ?? []
      const yields = legacyHoldings.stockYields ?? []
      // 가중평균 배당률 (수동 입력 우선) — blendedYield 인라인 (db.ts는 corpSim import 회피)
      const yieldByTicker = new Map<string, number>()
      for (const y of yields) if (y.ticker && typeof y.yield === 'number') yieldByTicker.set(y.ticker, y.yield)
      const wHoldings = holdings.filter((h) => h.ticker && (h.weight ?? 0) > 0)
      const totalW = wHoldings.reduce((s, h) => s + (h.weight ?? 0), 0)
      let blendedY = 0
      if (totalW > 0) {
        blendedY = wHoldings.reduce((s, h) => s + (yieldByTicker.get(h.ticker as string) ?? 0) * ((h.weight ?? 0) / totalW), 0)
      }
      // 가중평균 상승률
      const gHoldings = holdings.filter((h) => h.ticker && (h.weight ?? 0) > 0 && (h.growthRate ?? 0) > 0)
      const gW = gHoldings.reduce((s, h) => s + (h.weight ?? 0), 0)
      const blendedG = gW > 0 ? gHoldings.reduce((s, h) => s + (h.growthRate ?? 0) * ((h.weight ?? 0) / gW), 0) : 0
      const yieldVal = blendedY > 0 ? blendedY : (legacyHoldings.stockManualYield ?? 4)
      const growthVal = blendedG > 0 ? blendedG : (legacyHoldings.stockGrowthRate ?? 5)
      parsed.stockAccount = {
        husband: { extraAmount: 0, dividendYield: yieldVal, growthRate: growthVal },
        wife:    { extraAmount: 0, dividendYield: yieldVal, growthRate: growthVal },
      }
      delete (parsed as { stockHoldings?: unknown }).stockHoldings
      delete (parsed as { stockYields?: unknown }).stockYields
      delete (parsed as { stockGrowthRate?: unknown }).stockGrowthRate
      delete (parsed as { stockManualYield?: unknown }).stockManualYield
    }
    // 마이그레이션: 구 comprehensiveDeduction → spouseDependent/dependents/useStandardDeduction
    const legacyDed = parsed as { comprehensiveDeduction?: number; spouseDependent?: boolean; useStandardDeduction?: boolean }
    if (typeof legacyDed.comprehensiveDeduction === 'number' && legacyDed.spouseDependent === undefined) {
      parsed.spouseDependent = true
      parsed.dependents = (parsed.dependents as number) ?? 0
      parsed.useStandardDeduction = true
      delete (parsed as { comprehensiveDeduction?: number }).comprehensiveDeduction
    }
    // 구 inflows(PensionInflowItem)는 migrateInflowsToLumpsumAndAllocations에서 목돈+분배로 이전됨.
    if (parsed.allocations === undefined) parsed.allocations = []
    return parsed as unknown as PensionSimPlan
  } catch {
    return null
  }
}

export async function savePensionSim(data: PensionSimPlan): Promise<void> {
  await db.settings.put({ key: PENSION_SIM_KEY, value: JSON.stringify(data) })
}

// ──────────────────────────────────────────────────────────────
// 공통 투자 포트폴리오 (법인·연금 시뮬 공유)
// ──────────────────────────────────────────────────────────────
const PORTFOLIO_KEY = 'portfolio_settings'

export async function getPortfolio(): Promise<PortfolioSettings | null> {
  const row = await db.settings.get(PORTFOLIO_KEY)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    // 마이그레이션: 종목 기반(holdings/blendedYield/manualYields) → 단순 배당률·상승률
    const legacy = parsed as {
      holdings?: { ticker?: string; weight?: number; growthRate?: number }[]
      blendedYield?: number; manualYields?: { ticker?: string; yield?: number }[]
      dividendYield?: number; growthRate?: number
    }
    if (legacy.holdings !== undefined && legacy.dividendYield === undefined) {
      // 배당률: 저장된 blendedYield 우선, 없으면 manualYields 평균
      let dy = typeof legacy.blendedYield === 'number' ? legacy.blendedYield : 0
      if (dy <= 0 && legacy.manualYields && legacy.manualYields.length > 0) {
        dy = legacy.manualYields.reduce((s, m) => s + (m.yield ?? 0), 0) / legacy.manualYields.length
      }
      // 상승률: holdings growthRate 가중평균
      const holdings = legacy.holdings ?? []
      const gH = holdings.filter((h) => (h.weight ?? 0) > 0 && Number.isFinite(h.growthRate))
      const gW = gH.reduce((s, h) => s + (h.weight ?? 0), 0)
      const gr = gW > 0 ? gH.reduce((s, h) => s + (h.growthRate ?? 0) * ((h.weight ?? 0) / gW), 0) : 0
      parsed.dividendYield = Math.max(0,dy)
      parsed.growthRate = gr
      delete (parsed as { holdings?: unknown }).holdings
      delete (parsed as { blendedYield?: unknown }).blendedYield
      delete (parsed as { manualYields?: unknown }).manualYields
    }
    return parsed as unknown as PortfolioSettings
  } catch {
    return null
  }
}

export async function savePortfolio(data: PortfolioSettings): Promise<void> {
  await db.settings.put({ key: PORTFOLIO_KEY, value: JSON.stringify(data) })
}

// ── 주식 계좌별 명의 ──────────────────────────────────────────
// 주식은 계좌 단위(키움증권, NH증권 등)로 명의가 결정됨 — 계좌 안 종목 공유.
const STOCK_ACCOUNT_OWNERSHIP_KEY = 'stock_account_ownership'

export async function getStockAccountOwnership(): Promise<Record<string, { husband: number; wife: number }>> {
  const row = await db.settings.get(STOCK_ACCOUNT_OWNERSHIP_KEY)
  if (!row) return {}
  try { return JSON.parse(row.value) as Record<string, { husband: number; wife: number }> }
  catch { return {} }
}

export async function saveStockAccountOwnership(map: Record<string, { husband: number; wife: number }>): Promise<void> {
  await db.settings.put({ key: STOCK_ACCOUNT_OWNERSHIP_KEY, value: JSON.stringify(map) })
}

/** 주식 계좌명 변경 — 계좌 안 모든 종목의 accountName, 연금 연동(linkedStockId),
 *  계좌별 명의(ownership) 키를 한 번에 바꾼다.
 *  newName 이 기존 다른 계좌명과 같으면 그 계좌로 병합된다(명의는 기존 new 계좌값 우선). */
export async function renameStockAccount(oldName: string, newName: string): Promise<void> {
  const old = oldName.trim()
  const next = newName.trim()
  if (!old || !next || old === next) return
  await db.transaction('rw', ['stockDetails', 'pensionDetails', 'settings'], async () => {
    // 1) 주식 종목의 accountName
    for (const s of await db.stockDetails.toArray()) {
      if (s.accountName === old) {
        s.accountName = next
        await db.stockDetails.put(s)
      }
    }
    // 2) 연금 연동(linkedStockId 에 계좌명 저장)
    for (const p of await db.pensionDetails.toArray()) {
      if (p.linkedStockId === old) {
        p.linkedStockId = next
        await db.pensionDetails.put(p)
      }
    }
    // 3) 계좌별 명의 키 이동 (병합 시 기존 new 계좌 명의 우선)
    const own = await getStockAccountOwnership()
    if (own[old]) {
      if (!own[next]) own[next] = own[old]
      delete own[old]
      await saveStockAccountOwnership(own)
    }
  })
}

/** 마이그레이션: 기존 STOCK 자산들의 ownership을 계좌별 첫 값으로 옮김 (1회). */
export async function migrateStockOwnershipToAccount(): Promise<void> {
  const current = await getStockAccountOwnership()
  if (Object.keys(current).length > 0) return  // 이미 마이그레이션됨
  const all = await getAllAssets()
  const next: Record<string, { husband: number; wife: number }> = {}
  for (const a of all) {
    if (a.type !== 'STOCK' || !a.detail) continue
    const acct = (a.detail as { accountName?: string }).accountName
    if (!acct || next[acct]) continue
    next[acct] = a.ownership ?? { husband: 50, wife: 50 }
  }
  if (Object.keys(next).length > 0) await saveStockAccountOwnership(next)
}

/** 마이그레이션: 개인투자시뮬 inflows → 은퇴계획 lumpsum(단일 소스) + 시뮬 allocations로 되돌림 (1회).
 *  목돈 입력은 은퇴계획, 시뮬은 그 목돈을 분배만. destination=irp→irpAmount, stock→stockAmount,
 *  corp→lumpsumCorp(법인시뮬), cash→분배없음(전액 현금). */
export async function migrateInflowsToLumpsumAndAllocations(): Promise<boolean> {
  const s = await getSettings()
  if ((s as Record<string, unknown>).inflowsToLumpsumMigrated) return false
  const row = await db.settings.get(PENSION_SIM_KEY)
  const parsed = row ? (JSON.parse(row.value) as Record<string, unknown>) : null
  const inflows = Array.isArray(parsed?.inflows) ? (parsed!.inflows as Array<Record<string, unknown>>) : []

  const ret = await getRetirement()
  const existingLumpsum = [...((ret as { lumpsum?: LumpsumItem[] }).lumpsum ?? [])]
  const sim = await getPensionSim()
  const base = (sim ?? {}) as Partial<PensionSimPlan>
  const corp = await getCorpSim()

  const newLumpsum: LumpsumItem[] = []
  const newAllocations: PensionSimPlan['allocations'] = [...(base.allocations ?? [])]
  const newLumpsumCorp = [...((corp as { lumpsumCorp?: { lumpsumId: string; corpAmount: number }[] } | null)?.lumpsumCorp ?? [])]

  for (const inf of inflows) {
    const id = (inf.id as string) ?? `mig-${Math.random().toString(36).slice(2, 8)}`
    const name = (inf.name as string) ?? '목돈'
    const amount = Number(inf.amount) || 0
    const year = Number(inf.year) || new Date().getFullYear()
    const dest = inf.destination as string
    newLumpsum.push({
      id, name, amount, receiveYear: year,
      taxKind: (inf.taxKind as LumpsumItem['taxKind']) ?? 'other',
    })
    if (dest === 'irp') newAllocations.push({ lumpsumId: id, irpAmount: amount, stockAmount: 0 })
    else if (dest === 'stock') newAllocations.push({ lumpsumId: id, irpAmount: 0, stockAmount: amount })
    else if (dest === 'corp') newLumpsumCorp.push({ lumpsumId: id, corpAmount: amount })
  }

  await saveRetirement({ ...ret, lumpsum: [...existingLumpsum, ...newLumpsum] })
  await savePensionSim({ ...base, allocations: newAllocations } as PensionSimPlan)
  if (corp) await saveCorpSim({ ...corp, lumpsumCorp: newLumpsumCorp } as CorpSimPlan)

  if (parsed) {
    delete parsed.inflows
    await db.settings.put({ key: PENSION_SIM_KEY, value: JSON.stringify(parsed) })
  }
  await saveSettings({ inflowsToLumpsumMigrated: '1' })
  return inflows.length > 0
}

/** 마이그레이션(1회): 기존 이력의 빈 날짜를 직전 기록값으로 소급 백필.
 *  과거에는 시세를 가끔씩만 갱신해 6/18→7/26→8/23처럼 드문드문 남은 경우
 *  차트는 ffill으로 이어지지만 이력 데이터는 비어 있어 '연속 보기'가 끊긴다.
 *  첫~마지막 기록 사이의 모든 빈 날짜를 이전 행의 value/price/quantity로 채운다. */
/** 실제 과거 종가 소급 반영 — 이미 기록된 날짜의 price를 실세가로 덮어쓰고 value 재계산.
 *  보유 수량은 기존 기록 값 유지(과거 매수/매도 이력 보존). 존재하는 행만 갱신. */
export async function applyPriceHistory(
  assetId: string,
  series: { date: string; close: number }[],
): Promise<number> {
  const stock = await db.stockDetails.get(assetId)
  const rate = await getExchangeRate(stock?.currency ?? 'KRW')
  let updated = 0
  await db.transaction('rw', 'assetHistory', async () => {
    for (const { date, close } of series) {
      const existing = await db.assetHistory
        .where('[assetId+date]').equals([assetId, date]).first()
      if (!existing) continue   // 기록 없는 날은 건너뜀 (수량을 모르는 날 추정 불가)
      const qty = existing.quantity ?? 0
      await db.assetHistory.put({
        ...existing,
        price: close,
        value: close * qty * rate,
      })
      updated++
    }
  })
  return updated
}

/** 보유 주식 전체의 최근 N개월 실제 종가 소급 반영 (설정 페이지 버튼용).
 *  Yahoo 일별 종가를 가져와 기존 이력 행의 price/value를 실세가로 덮어쓴다. */
export async function backfillStockPrices(
  months = 3,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ assets: number; updated: number; failed: string[] }> {
  const stocks = (await getAllAssets('STOCK')).filter(
    (a) => !a.disposalDate && (a.detail as { ticker?: string } | undefined)?.ticker,
  )
  const range = months <= 1 ? '1mo' : months <= 3 ? '3mo' : months <= 6 ? '6mo' : '1y'
  let updated = 0
  const failed: string[] = []
  let done = 0
  for (const a of stocks) {
    const ticker = (a.detail as { ticker?: string }).ticker!
    const hist = await fetchStockHistory(ticker, range)
    if (hist) updated += await applyPriceHistory(a.id, hist)
    else failed.push(a.name)
    done++
    onProgress?.(done, stocks.length, a.name)
  }
  return { assets: stocks.length, updated, failed }
}

export interface PriceCorrectionPreview {
  assets: number; failed: string[]; from: string; to: string
  changes: {before: HistoryRow; after: HistoryRow}[]
  additions?: HistoryRow[]
  guards?: {assetId: string; fingerprint: string}[]
  checked?: number; unchanged?: number; noHistory?: number; excluded?: number; missingQuantity?: number
}
async function correctionState(assetId: string) {
  return {
    asset: await db.assets.get(assetId),
    stock: await db.stockDetails.get(assetId),
    history: (await db.assetHistory.where('assetId').equals(assetId).toArray()).sort((a,b)=>a.date.localeCompare(b.date)),
  }
}
export async function previewStockPriceCorrection(months=3, onProgress?: (done: number, total: number) => void):Promise<PriceCorrectionPreview> {
  const end=new Date(),start=new Date(end),day=start.getUTCDate()
  start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-months)
  start.setUTCDate(Math.min(day,new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate()))
  const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10)
  // Foreign KRW valuations require historical FX. Never use today's rate for past dates.
  const all=(await getAllAssets('STOCK')).filter(a=>!a.disposalDate&&(a.detail as StockRow)?.ticker)
  const stocks=all.filter(a=>(a.detail as StockRow)?.currency==='KRW'&&!(a.detail as StockRow)?.isAccountLevel)
  const preview:PriceCorrectionPreview={assets:stocks.length,failed:[],excluded:all.length-stocks.length,from,to,changes:[],additions:[],guards:[],checked:0,unchanged:0,noHistory:0,missingQuantity:0}
  const cache=new Map<string,Awaited<ReturnType<typeof fetchStockHistory>>>();let done=0
  onProgress?.(0,stocks.length)
  for(const a of stocks){
    const ticker=(a.detail as StockRow).ticker!
    if(!cache.has(ticker))cache.set(ticker,await fetchStockHistory(ticker,months<=3?'3mo':'1y'))
    const series=cache.get(ticker)
    if(!series){preview.failed.push(a.name);onProgress?.(++done,stocks.length);continue}
    const state=await db.transaction('r',db.assets,db.stockDetails,db.assetHistory,()=>correctionState(a.id))
    if(!state.asset||state.asset.disposalDate||state.stock?.ticker!==ticker||state.stock.currency!=='KRW'||state.stock.isAccountLevel)throw new Error('조회 중 자산 정보가 변경되었습니다. 다시 조회해 주세요.')
    preview.guards!.push({assetId:a.id,fingerprint:fingerprint(state)})
    const rows=state.history,byDate=new Map(rows.map(h=>[h.date,h]))
    const anchors=rows.filter(h=>!h.quantitySourceDate)
    const seen=new Set<string>();let matched=0
    for(const observation of [...series].sort((x,y)=>x.date.localeCompare(y.date))){
      const date=observation.date
      if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||date<from||date>=to||(state.asset.acquisitionDate&&date<state.asset.acquisitionDate)||seen.has(date)||!Number.isFinite(observation.close)||observation.close<=0)continue
      seen.add(date)
      const row=byDate.get(date)
      const previous=anchors.filter(h=>h.date<date)
      const source=row&&!row.quantitySourceDate?row:previous[previous.length-1]
      const quantity=source?.quantity
      if(quantity==null||!Number.isFinite(quantity)||quantity<0){preview.missingQuantity!++;continue}
      matched++;preview.checked!++
      const after:HistoryRow={...(row??{assetId:a.id,date}),price:observation.close,quantity,value:observation.close*quantity}
      if(!row||row.quantitySourceDate)after.quantitySourceDate=source!.date
      if(!row)preview.additions!.push(after)
      else if(fingerprint(row)!==fingerprint(after))preview.changes.push({before:row,after})
      else preview.unchanged!++
    }
    if(!matched)preview.noHistory!++
    onProgress?.(++done,stocks.length)
  }
  return preview
}
export async function applyStockPriceCorrection(preview:PriceCorrectionPreview) {
  if(!preview.changes.length&&!preview.additions?.length)return
  await db.transaction('rw',db.assets,db.stockDetails,db.assetHistory,db.table('plannerRecovery'),async()=>{
    for(const guard of preview.guards??[]){
      if(fingerprint(await correctionState(guard.assetId))!==guard.fingerprint)throw new Error('미리보기 뒤 자산·수량·이력이 변경되었습니다. 다시 조회해 주세요.')
    }
    for(const change of preview.changes){
      const current=await db.assetHistory.get(change.before.id!)
      if(fingerprint(current)!==fingerprint(change.before))throw new Error('미리보기 뒤 이력이 변경되었습니다. 다시 조회해 주세요.')
    }
    const keys=new Set<string>()
    for(const row of preview.additions??[]){
      const key=row.assetId+':'+row.date
      if(keys.has(key)||await db.assetHistory.where('[assetId+date]').equals([row.assetId,row.date]).count())throw new Error('추가할 날짜에 이미 이력이 있습니다. 다시 조회해 주세요.')
      keys.add(key)
    }
    const additions:HistoryRow[]=[]
    for(const row of preview.additions??[]){const {id: _id,...value}=row;const id=await db.assetHistory.add(value);additions.push({...value,id})}
    for(const change of preview.changes)await db.assetHistory.put(change.after)
    await db.table('plannerRecovery').put({id:'price-correction',createdAt:new Date().toISOString(),changes:preview.changes,additions})
  })
}
export async function undoStockPriceCorrection() {
  await db.transaction('rw',db.assetHistory,db.table('plannerRecovery'),async()=>{
    const row=await db.table('plannerRecovery').get('price-correction');if(!row)throw new Error('되돌릴 시세 보정이 없습니다.')
    for(const after of [...row.changes.map((change:{after:HistoryRow})=>change.after),...(row.additions??[])]){
      const current=await db.assetHistory.get(after.id)
      if(fingerprint(current)!==fingerprint(after))throw new Error('보정 이후 해당 이력이 변경되어 자동 되돌리기를 중단했습니다.')
    }
    for(const change of row.changes)await db.assetHistory.put(change.before)
    for(const added of row.additions??[])await db.assetHistory.delete(added.id)
    await db.table('plannerRecovery').delete('price-correction')
  })
}

export async function migrateBackfillHistory(): Promise<boolean> {
  const s = await getSettings()
  if ((s as Record<string, unknown>).historyBackfillMigrated) return false
  await saveSettings({ historyBackfillMigrated: '1' })
  return backfillAllHistoryGaps()
}

/** 전 자산의 이력에서 첫~마지막 기록 사이 모든 빈 날짜를 직전값으로 소급 채움 (갭 길이 무제한) */
async function backfillAllHistoryGaps(): Promise<boolean> {
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const all = await db.assets.toArray()
  let added = 0
  for (const a of all) {
    const rows = (await db.assetHistory.where('assetId').equals(a.id).toArray())
      .sort((x, y) => x.date.localeCompare(y.date))
    if (rows.length < 2) continue

    const have = new Set(rows.map((r) => r.date))
    const fills: { assetId: string; date: string; value: number | null; price: number | null; quantity: number | null }[] = []
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const start = new Date(prev.date + 'T00:00:00')
      const end   = new Date(rows[i].date + 'T00:00:00')
      const gapDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
      for (let k = 1; k < gapDays; k++) {
        const dt = new Date(start)
        dt.setDate(dt.getDate() + k)
        const ds = fmt(dt)
        if (have.has(ds)) continue
        fills.push({
          assetId: a.id, date: ds,
          value: prev.value ?? null, price: prev.price ?? null, quantity: prev.quantity ?? null,
        })
      }
    }
    if (fills.length > 0) {
      await db.assetHistory.bulkAdd(fills)
      added += fills.length
    }
  }
  return added > 0
}

/** 마이그레이션: 구 currentAge/retirementAge(나이) → 생년월(YYYY.MM)+은퇴예정연도(연도).
 *  구 나이 설정이 저장된 경우만 실행(기존 나이에서 역산 — 연령 보존).
 *  신규 사용자는 생년월을 비워둠(설정에서 입력). birthWife는 설정하지 않음(미혼 기본 — 설정에서 입력). */
export async function migrateSettingsToBirth(): Promise<void> {
  const s = await getSettings()
  if (s.birthHusband) return  // 이미 설정됨
  if (s.currentAge == null && s.retirementAge == null && s.retirementYear == null) return  // 신규 사용자 — 변환할 구 데이터 없음
  const currentAge = s.currentAge ?? 40
  const retirementAge = s.retirementAge ?? 65
  const now = new Date().getFullYear()
  await saveSettings({
    birthHusband: `${now - currentAge}.01`,
    retirementYear: s.retirementYear ?? (now + Math.max(0, retirementAge - currentAge)),
  })
}

