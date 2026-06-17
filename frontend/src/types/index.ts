export type AssetType = 'REAL_ESTATE' | 'STOCK' | 'PENSION' | 'SAVINGS' | 'PHYSICAL' | 'ETC'
export type Currency   = 'KRW' | 'USD' | 'JPY'

export interface HistoryItem {
  date:      string
  value?:    number
  price?:    number
  quantity?: number
}

export interface RealEstateDetail {
  isOwned:       boolean
  hasTenant:     boolean
  tenantDeposit: number
  address:       string
  loanAmount:    number
}

export interface StockDetail {
  accountName:      string
  currency:         Currency
  isPensionLike:    boolean
  pensionStartYear?: number
  pensionMonthly?:   number
  ticker?:           string
  dividendYield?:    number   // 배당수익률 (%)
  dividendDps?:      number   // 주당 배당금 (KRW 환산)
  dividendCycle?:    string   // 월|분기|반기|연간
}

export interface DividendRecord {
  id:             number
  assetId:        string
  date:           string
  amountKrw:      number
  amountOriginal: number
  currency:       string
  exchangeRate:   number
  memo:           string
}

export interface DividendSummary {
  items: {
    assetId:      string
    name:         string
    accountName:  string
    currency:     string
    exchangeRate: number
    dividendYield: number
    dividendDps:   number
    dividendCycle: string
    annualKrw:    number
    monthlyKrw:   number
  }[]
  totalAnnual:  number
  totalMonthly: number
}

export interface PensionDetail {
  pensionType?:           string
  expectedStartYear:      number
  expectedEndYear:        number
  expectedMonthlyPayout:  number
  annualGrowthRate:       number
  hideInChart?:           boolean
}

export interface SavingsDetail {
  isPensionLike:    boolean
  pensionStartYear?: number
  pensionMonthly?:   number
}

export type AssetDetail = RealEstateDetail | StockDetail | PensionDetail | SavingsDetail

export interface Asset {
  id:               string
  type:             AssetType
  name:             string
  currentValue:     number
  previousValue?:   number   // 직전 이력 시점 평가액 (전일 등락 계산용)
  previousPrice?:   number   // 직전 이력 시점 주당 단가 (주식 전일 등락 계산용, 원래 통화)
  acquisitionDate:  string
  acquisitionPrice: number
  disposalDate?:    string
  disposalPrice?:   number
  quantity:         number
  createdAt:        string
  updatedAt:        string
  history:          HistoryItem[]
  detail?:          AssetDetail
}

export interface ChartDataPoint {
  date:   string
  label:  string
  value:  number
}

export interface ChartParams {
  type?:     AssetType
  period?:   'all' | '10y' | '3y' | '1y' | '3m' | '1m'
  group_by?: 'type' | 'name' | 'account'
  account?:  string
}

export interface CategoryKpi {
  totalAsset:     number
  totalLiability: number
  netWorth:       number
}

export interface Settings {
  currentAge:    number
  retirementAge: number
  [key: string]: number | string
}

// ── 은퇴 계획 ──────────────────────────────────────────────
export interface ExpenseItem  { id: string; name: string; amount: number }
export interface TravelItem   { id: string; name: string; costPerTrip: number; phase1Times: number; phase1Until: number; phase2Times: number }
export interface LumpsumItem  { id: string; name: string; receiveYear: number; amount: number; useEndYear: number }
export interface EmergencyItem{ id: string; name: string; year: number; amount: number }

export interface HealthInsuranceInputs {
  interestDividendIncome: number  // 이자·배당소득 (연, 수동입력)
  pensionIncome:          number  // 연금소득 (연, 수동입력)
  otherIncome:            number  // 기타소득 (연)
  propertyTaxBase:        number  // 재산세 과세표준
  rentalDeposit:          number  // 임차보증금 (전세 등)
  carValue:               number  // 차량가액
  scorePerPoint:          number  // 점수당 금액 (기본 208.4원)
  autoLinkPension:        boolean // 연금 시뮬레이션 자동 연동
  autoLinkDividend:       boolean // 배당금 자동 연동
}

export interface RetirementPlan {
  expenses:        ExpenseItem[]
  travel:          TravelItem[]
  medicalMonthly:  number
  lumpsum:         LumpsumItem[]
  emergency:       EmergencyItem[]
  retirementYear:  number
  healthInsurance: HealthInsuranceInputs
}
