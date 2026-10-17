import Dexie, { type Table } from 'dexie'
import type { AssetType, Currency } from '@/types'

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
