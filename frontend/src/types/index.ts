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
  linkCorpSim:     boolean
  linkPensionSim:  boolean
}

// ── 투자법인 시뮬레이터 ────────────────────────────────────
export interface CorpTaxParams {
  corpTaxRateLow:        number   // 0.09  (과세표준 2억 이하)
  corpTaxRateMid:        number   // 0.19  (2억 초과)
  corpTaxThreshold:      number   // 200_000_000
  dividendTaxRate:       number   // 0.154 (배당소득세)
  finIncomeCombinedThr:  number   // 20_000_000 (금융소득종합과세 기준, 연)
  giftTaxRate:           number   // 0.30  (자녀 승계 비교용 증여/상속세율 추정)
  salaryTaxRate:         number   // 0.03  (급여 소득세 추정률)
  healthInsRate:         number   // 0.0709 (건강보험료율, 본인부담 50% 별도)
}

export interface PortfolioHolding {
  ticker: string
  weight: number                 // 비중(정규화 전, 예: 1:1:1 → 각 1)
}

// ── 공통 투자 포트폴리오 (법인·연금 시뮬 공유) ─────────────
export interface PortfolioSettings {
  holdings:    PortfolioHolding[]
  blendedYield: number           // 자동 산정 가중평균 수익률(%)
}
export interface PortfolioYield {
  ticker: string
  yield: number                  // 3년평균 배당수익률(%)
}

export interface CorpSimPlan {
  capitalContribution:     number             // 출자금(자본금) 총액 — 3인 지분율로 분할
  loanAmount:              number             // 가수금(주주 대여금) 총액 — 부부 50/50
  dividendYield:           number             // 예상 배당수익률(%)
  targetDividendTotal:     number             // 연 배당총액(0 = 수익률 자동)
  shareHusband:            number             // 지분 %(부)
  shareWife:               number             // 지분 %(모)
  shareSon:                number             // 지분 %(자)
  repSalaryMonthly:        number             // 대표(아내) 월급
  repSalaryHusbandMonthly: number             // 남편 월급(직장가입자 본인)
  sonEmployed:             boolean            // 아들 취업 토글(건보 마진 기준)
  annualMaintCost:         number             // 법인 연 유지비
  monthlyReturn:           number             // 가수금 월 반환(비과세 생활비)
  personalHealthAnnual:    number             // 개인명의 시 지역건보(연, 비교용)
  giftTaxBase:             number             // 자녀 승계 비교용 재산액
  setupCost:               number             // 법인 설립비(초기)
  portfolio:               PortfolioHolding[] // 배당주 포트폴리오(자동 수익률용)
  linkPension:             boolean            // 연금 자동 연동(은퇴 계획에서)
  pensionIncomeAnnual:     number             // 연금소득(연) — linkPension 시 자동 산출
  tax:                     CorpTaxParams
}

// ── 연금 시뮬레이터 ────────────────────────────────────────
export type PensionTaxType = 'irp' | 'taxable' | 'taxExempt'
// irp: 퇴직연금(DC)→IRP 이체, 연금소득세 대상 (공제 1,200만 적용)
// taxable: 연금저축(신규), 연금소득세 대상
// taxExempt: 연금저축(98년 한시적 비과세), 수령 시 세금 0

export interface PensionSource {
  id: string
  name: string              // 자산명 (자산에서 자동 채움)
  principal: number         // 원금 (자산 currentValue)
  taxType: PensionTaxType   // 과세 구분
  yieldRate: number         // 운용 수익률(%)
}

export interface PensionSimPlan {
  sources:                  PensionSource[]
  withdrawalYears:          number           // 수령 기간(연)
  startYear:                number           // 수령 개시 연도
  isaBalance:               number           // ISA 잔액
  rentalDeposit:            number           // 전세금/보증금 (수령 예정)
  rentalYield:              number           // 전세금 투자 수익률(%)
  pensionDeduction:         number           // 연금소득공제 (기본 12,000,000)
  healthPropertyBase:       number           // 건보 재산 과표
}

