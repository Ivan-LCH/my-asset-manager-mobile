// 지역건강보험료 계산 (2025년 지역가입자 기준, 단순화).
// RetirementPage 에서 추출 — 법인시뮬·연금시뮬·은퇴계획 공유.
import type { Asset, RealEstateDetail, Ownership } from '@/types'

// 재산 점수표: 재산세 과세표준 5,000만원 공제 후 구간별 점수 (단위: 만원)
export const PROPERTY_SCORE_TABLE: [number, number][] = [
  [0,      22],  [450,    30],  [900,    40],  [1_350,  50],
  [1_800,  65],  [2_400,  80],  [3_000,  95],  [3_600, 113],
  [4_800, 133],  [6_000, 165],  [9_000, 205],  [12_000, 248],
  [15_000, 290], [18_000, 330], [21_000, 369], [24_000, 406],
  [27_000, 441], [30_000, 484], [36_000, 530], [42_000, 571],
  [48_000, 610], [54_000, 645],
]

export function getPropertyScore(taxBase: number): number {
  const baseMan = taxBase / 10_000
  const deducted = Math.max(0, baseMan - 5_000) // 5천만원 공제
  for (let i = PROPERTY_SCORE_TABLE.length - 1; i >= 0; i--) {
    if (deducted >= PROPERTY_SCORE_TABLE[i][0]) return PROPERTY_SCORE_TABLE[i][1]
  }
  return 0
}

export interface HealthResult {
  incomeMonthly:    number  // 소득보험료
  propertyMonthly:  number  // 재산보험료
  carMonthly:       number  // 자동차보험료
  healthTotal:      number  // 건강보험료 합계
  longTermCare:     number  // 장기요양보험료
  grandTotal:       number  // 최종 납부액(월)
  isMinimum:        boolean
}

export interface HealthInputs {
  pensionAnnual:    number  // 연금소득(연) — 50% 반영
  dividendAnnual:   number  // 이자·배당(연) — 100%
  otherAnnual:      number  // 기타소득(연) — 100%
  propertyTaxBase:  number  // 재산세 과세표준
  rentalDeposit:    number  // 임차보증금 (30% 반영)
  carValue:         number  // 차량가액
  scorePerPoint:    number  // 점수당 금액(기본 208.4)
}

export const HI_RATE = 0.0709        // 보험료율 7.09%
export const HI_LONG_TERM = 0.1295    // 장기요양 12.95%
export const HI_MIN_HEALTH = 19_780   // 최저 건강보험료(월)
export const HI_SCORE_PER_PT = 208.4

/** 1인 건강보험료(월). */
export function calcHealthInsurance(hi: HealthInputs): HealthResult {
  const RATE = HI_RATE
  const SCORE_PER_PT = hi.scorePerPoint || HI_SCORE_PER_PT
  const LONG_TERM = HI_LONG_TERM
  const MIN_HEALTH = HI_MIN_HEALTH

  const totalIncome = hi.dividendAnnual * 1.0 + hi.pensionAnnual * 0.5 + hi.otherAnnual * 1.0
  const incomeMonthly = totalIncome > 0 ? (totalIncome / 12) * RATE : 0

  const propertyBase = hi.propertyTaxBase + hi.rentalDeposit * 0.3
  const propertyMonthly = getPropertyScore(propertyBase) * SCORE_PER_PT

  let carMonthly = 0
  if (hi.carValue >= 40_000_000) {
    const carScore = hi.carValue < 60_000_000 ? 45 : hi.carValue < 80_000_000 ? 62 : 80
    carMonthly = carScore * SCORE_PER_PT
  }

  const rawHealth = incomeMonthly + propertyMonthly + carMonthly
  const isMinimum = rawHealth < MIN_HEALTH
  const healthTotal = Math.max(rawHealth, MIN_HEALTH)
  const longTermCare = Math.round(healthTotal * LONG_TERM)
  const grandTotal = Math.round(healthTotal) + longTermCare
  return { incomeMonthly, propertyMonthly, carMonthly, healthTotal, longTermCare, grandTotal, isMinimum }
}

/**
 * 부동산 자산에서 1인별 재산세 과세표준 추정.
 * currentValue × 명의 지분을 합산. (실제는 공시가격이나 단순화로 시가 기준.)
 * rentalDeposit(전세금)도 지분별로 합산 — 건보 재산분은 보증금의 30% 반영되므로 여기선 원금을 반환(계산측에서 ×0.3).
 */
export function realEstatePropertyBases(
  assets: Asset[],
): { husband: { propertyTaxBase: number; rentalDeposit: number }; wife: { propertyTaxBase: number; rentalDeposit: number } } {
  let hp = 0, hd = 0, wp = 0, wd = 0
  for (const a of assets) {
    if (a.type !== 'REAL_ESTATE' || a.disposalDate) continue
    const d = a.detail as RealEstateDetail | undefined
    if (!d) continue
    const o: Ownership = d.ownership ?? { husband: 50, wife: 50 }
    hp += a.currentValue * (o.husband / 100)
    wp += a.currentValue * (o.wife / 100)
    hd += (d.tenantDeposit ?? 0) * (o.husband / 100)
    wd += (d.tenantDeposit ?? 0) * (o.wife / 100)
  }
  return {
    husband: { propertyTaxBase: Math.round(hp), rentalDeposit: Math.round(hd) },
    wife: { propertyTaxBase: Math.round(wp), rentalDeposit: Math.round(wd) },
  }
}
