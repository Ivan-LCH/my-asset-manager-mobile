export type AssetType = 'REAL_ESTATE' | 'STOCK' | 'PENSION' | 'SAVINGS' | 'PHYSICAL' | 'ETC'
export type Currency   = 'KRW' | 'USD' | 'JPY'

// ── 명의(지분) ─────────────────────────────────────────────
// 프리셋(mine/half/wife)은 UI 입력용; 저장은 항상 Ownership(퍼센트).
export type OwnershipPreset = 'mine' | 'half' | 'wife' | 'custom'
export interface Ownership { husband: number; wife: number }   // husband + wife === 100
export const PRESET_TO_OWNERSHIP: Record<Exclude<OwnershipPreset, 'custom'>, Ownership> = {
  mine: { husband: 100, wife: 0 },
  half: { husband: 50, wife: 50 },
  wife: { husband: 0, wife: 100 },
}
export const ownershipFromPreset = (p: OwnershipPreset): Ownership =>
  p === 'custom' ? { husband: 50, wife: 50 } : PRESET_TO_OWNERSHIP[p]
export const presetFromOwnership = (o: Ownership): OwnershipPreset => {
  const k = `${o.husband}|${o.wife}`
  if (k === '100|0') return 'mine'
  if (k === '50|50') return 'half'
  if (k === '0|100') return 'wife'
  return 'custom'
}
export const splitByOwnership = (amount: number, o: Ownership) => ({
  husband: (amount * o.husband) / 100,
  wife: (amount * o.wife) / 100,
})


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
  futureValue?:  number   // 재건축 후 예상 가치 (입주 시점)
  futureYear?:   number   // 재건축 완료(입주) 예정 연도
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
  linkedStockId?:         string   // 연동할 주식계좌(STOCK) id — 현재가치를 그 계좌에서 가져옴
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
  ownership:        Ownership   // 명의 지분 (기본 50:50, 세금·건보 1인별 산정)
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
  currentAge:    number       // (구버전, 생년월 미입력 시 폴 백)
  retirementAge: number       // (구버전, retirementYear 미입력 시 폴 백)
  birthHusband?: string       // 남편 생년월 "YYYY.MM" (예: 1972.03)
  birthWife?:    string       // 와이프 생년월 "YYYY.MM" (비우면 미혼/단독 가정)
  retirementYear?: number     // 은퇴 예정 연도
  [key: string]: number | string | undefined
}

// ── 은퇴 계획 ──────────────────────────────────────────────
export interface ExpenseItem  { id: string; name: string; amount: number }
export interface TravelItem   { id: string; name: string; costPerTrip: number; phase1Times: number; phase1Until: number; phase2Times: number }
export interface LumpsumItem  { id: string; name: string; receiveYear: number; amount: number; taxKind?: 'severance' | 'other' }
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
  growthRate?: number            // 연평균 주가상승률(%) — 수동 또는 자동산정
  name?: string                  // 종목명 (자동산정 시 채움)
  isSafe?: boolean               // 안전자산(예금·채권 등) 여부 — IRP 30% 의무 비율용
}

// ── 공통 투자 포트폴리오 (법인·연금 시뮬 공유) ─────────────
// 단순화: 종목 단위 입력 제거 → 계좌 전체 배당률·상승률만 입력.
export interface PortfolioSettings {
  dividendYield: number          // 연평균 배당률(%)
  growthRate:    number          // 연평균 주가상승률(%)
}

export interface CorpSimPlan {
  capitalContribution:     number             // 출자금(자본금) 총액 — 3인 지분율로 분할
  loanAmount:              number             // 가수금(주주 대여금) 총액 — 부부 50/50
  lumpsumCorp:             { lumpsumId: string; corpAmount: number }[]  // 은퇴계획 목돈을 가수금으로 분배 (나머지=현금)
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
export type PensionTaxType = 'irp' | 'national' | 'taxable' | 'taxExempt'
// irp: 퇴직연금(DC)→IRP 이체, 연금소득세 대상 (공제 1,200만 적용)
// taxable: 연금저축(신규), 연금소득세 대상
// taxExempt: 연금저축(98년 한시적 비과세), 수령 시 세금 0

export interface PensionSource {
  id: string
  name: string              // 자산명 (자산에서 자동 채움)
  principal: number         // 원금 (자산 currentValue)
  taxType: PensionTaxType   // 과세 구분
  yieldRate: number         // 운용 수익률(%)
  owner: 'husband' | 'wife' // 명의 (기본 husband — 연금=남편 가정)
  taxTypeManual?: boolean   // 사용자가 PensionPage에서 수동 설정한 과세구분 여부 (true면 taxType 존중, 아니면 pensionType으로 자동 산출)
  // ── 수령 모델 (자산 detail에서 자동 채움) ──
  // expectedMonthlyPayout > 0 이면 등록 월수령액 모델 사용 (비과세·과세 연금저축).
  // 미등록(IRP 등)이면 퇴직시점 성장 잔액 ÷ 수령기간 모델로 산정.
  expectedMonthlyPayout?: number
  expectedStartYear?:       number
  expectedEndYear?:         number
  annualGrowthRate?:        number   // 연금 수령액 연 증가율(%)
}

export interface PensionAllocation {
  lumpsumId: string       // RetirementPlan.lumpsum 참조
  irpAmount: number       // → 퇴직IRP 원금
  stockAmount: number     // → 일반주식계좌 원금
  // 현금 = lumpsum.amount - irpAmount - stockAmount (나머지, 은퇴계획 목돈)
}

/** 일반주식계좌(남편/와이프 각각) 설정 — 종목 입력 없이 계좌 단위 배당률·상승률.
 *  잔액 = (목돈 분배 stock 합계 × stockOwnership 지분) + extraAmount. */
export interface StockAccountConfig {
  extraAmount: number     // 연결금액(목돈 분배) 외 추가 수동 금액(원)
  dividendYield: number   // 계좌 전체 배당률 (%)
  growthRate: number      // 계좌 전체 연평균 주가상승률 (%)
}

export interface PensionSimPlan {
  sources:                  PensionSource[]     // 기존 연금원천 (PensionPage에서 과세구분 관리)
  allocations:              PensionAllocation[] // 은퇴계획 목돈을 퇴직IRP/일반주식계좌로 분배
  stockAccount: {                               // 일반주식계좌 (남편/와이프 각각)
    husband: StockAccountConfig
    wife:    StockAccountConfig
  }
  stockOwnership:           Ownership           // 연결금액(목돈 분배 stock)을 남편/와이프로 분할할 비율
  otherIncome:              number              // 기타 종합소득(연, 근로/사업 등)
  spouseDependent:          boolean             // 배우자 부양공제 (기본 true, 부부 가정)
  dependents:               number              // 부양가족 수 (0~)
  useStandardDeduction:     boolean             // 표준공제 100만 사용
  withdrawalYears:          number              // 수령 기간(연)
  startYear:                number              // 수령 개시 연도
  refYear:                  number              // 기준년도 (수입·지출 스냅샷 기준, 기본 2030)
  pensionDeduction:         number              // 연금소득공제 (법정 고정 12,000,000)
}

