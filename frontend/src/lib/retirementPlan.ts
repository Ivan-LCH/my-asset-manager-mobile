// 은퇴 계획 공통 기본값·포맷 유틸 (UI 간소화 ④).
// RetirementPage(현금흐름 뷰)·RetirementPrepPage(입력 뷰)가 공유 — 페이지 로컬 2중 정의 해소.
import type { RetirementPlan, ExpenseItem, HealthInsuranceInputs, LumpsumItem } from '@/types'

export const uid = () => Math.random().toString(36).slice(2, 9)

export const DEFAULT_EXPENSES: ExpenseItem[] = [
  { id: uid(), name: '식비',       amount: 600_000 },
  { id: uid(), name: '주거관리비', amount: 200_000 },
  { id: uid(), name: '교통비',     amount: 150_000 },
  { id: uid(), name: '통신비',     amount: 80_000  },
  { id: uid(), name: '문화/여가',  amount: 200_000 },
  { id: uid(), name: '의복/미용',  amount: 100_000 },
  { id: uid(), name: '경조사비',   amount: 100_000 },
  { id: uid(), name: '기타잡비',   amount: 150_000 },
]

export const DEFAULT_HI: HealthInsuranceInputs = {
  interestDividendIncome: 0,
  pensionIncome:          0,
  otherIncome:            0,
  propertyTaxBase:        0,
  rentalDeposit:          0,
  carValue:               0,
  scorePerPoint:          208.4,
  autoLinkPension:        true,
  autoLinkDividend:       true,
}

export const EMPTY_PLAN: RetirementPlan = {
  expenses:        DEFAULT_EXPENSES,
  travel:          [],
  medicalMonthly:  200_000,
  lumpsum:         [],
  emergency:       [],
  retirementYear:  new Date().getFullYear() + 10,
  healthInsurance: DEFAULT_HI,
  linkCorpSim:     false,
  linkPensionSim:  false,
  holdingTaxAnnual:    0,   // 보유세 수동값 (자동 계산이 기본 — holdingTaxAuto)
  holdingTaxStartYear: undefined,
  holdingTaxAuto:      true,   // 부동산 자산에서 재산세+종부세 자동 산출
}

/** 저장된 은퇴계획 정규화 — 누락 필드 기본값 보강 + 구버전 데이터 변환.
 *  RetirementPage 로드 로직의 공용화(연도별 대시보드 등 분석 화면 공유). */
export function normalizeSavedPlan(saved: Partial<RetirementPlan>): RetirementPlan {
  return {
    expenseInflationRate: saved.expenseInflationRate,
    expenseBaseYear: saved.expenseBaseYear,
    expenses:       saved.expenses       ?? DEFAULT_EXPENSES,
    travel:         saved.travel         ?? [],
    medicalMonthly: saved.medicalMonthly ?? 200_000,
    lumpsum:        (saved.lumpsum ?? []).map((l) => ({
      ...l,
      // 구버전 정규화: useEndYear 제거, taxKind 'rental' → 'other'
      taxKind: ((l as { taxKind?: string }).taxKind === 'rental' ? 'other' : (l.taxKind ?? 'other')) as LumpsumItem['taxKind'],
    })),
    emergency:      saved.emergency      ?? [],
    retirementYear:  saved.retirementYear  ?? new Date().getFullYear() + 10,
    healthInsurance: saved.healthInsurance  ? { ...DEFAULT_HI, ...saved.healthInsurance } : DEFAULT_HI,
    linkCorpSim:     saved.linkCorpSim ?? false,
    linkPensionSim:  saved.linkPensionSim ?? false,
    // 레거시 병합: 보유세 수동값이 저장돼 있으면 수동으로 로드(값 조용히 변경 금지), 없으면 자동
    holdingTaxAuto:      saved.holdingTaxAuto ?? (saved.holdingTaxAnnual == null),
    holdingTaxAnnual:    saved.holdingTaxAnnual ?? 0,
    holdingTaxStartYear: saved.holdingTaxStartYear ?? undefined,
  }
}

/** 안전 숫자 변환 (undefined/문자열/NaN → 0). 가져온 plan 항목의 누락 필드 대비 */
export const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 만원 단위 숫자만(표 셀용 — '만원' 접미사 없음). 단위는 표 상단에 표시. */
export const fmtM = (v: number): string =>
  Number.isFinite(v) ? Math.round(v / 10000).toLocaleString('ko-KR') : '—'

export function pnlColor(v: number) {
  if (v > 0) return 'text-emerald-400'
  if (v < 0) return 'text-red-400'
  return 'text-gray-400'
}
