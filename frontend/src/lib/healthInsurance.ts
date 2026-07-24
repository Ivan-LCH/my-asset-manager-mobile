// 지역건강보험료 계산 (2025년 지역가입자 기준, 단순화).
// RetirementPage 에서 추출 — 법인시뮬·연금시뮬·은퇴계획 공유.
import type { Asset, RealEstateDetail } from '@/types'

// 지역가입자 재산 등급별 점수표 (시행령 제42조 [별표 4], 공식 60등급).
// 단위: 만원 (재산금액 = 재산세 과세표준 − 기본공제 1억). [하한, 점수]
export const PROPERTY_SCORE_TABLE: [number, number][] = [
  [450,     22],  [900,     44],  [1_350,   66],  [1_800,   97],
  [2_250,  122],  [2_700,  146],  [3_150,  171],  [3_600,  195],
  [4_050,  219],  [4_500,  244],  [5_020,  268],  [5_590,  294],
  [6_220,  320],  [6_930,  344],  [7_710,  365],  [8_590,  386],
  [9_570,  412],  [10_700, 439],  [11_900, 465],  [13_300, 490],
  [14_800, 516],  [16_400, 535],  [18_300, 559],  [20_400, 586],
  [22_700, 611],  [25_300, 637],  [28_100, 659],  [31_300, 681],
  [34_900, 706],  [38_800, 731],  [43_200, 757],  [48_100, 785],
  [53_600, 812],  [59_700, 841],  [66_500, 881],  [74_000, 921],
  [82_400, 961],  [91_800, 1_001],[103_000,1_091],[114_000,1_141],
  [127_000,1_191],[142_000,1_241],[158_000,1_291],[176_000,1_341],
  [196_000,1_391],[218_000,1_451],[242_000,1_511],[270_000,1_571],
  [300_000,1_641],[330_000,1_711],[363_000,1_781],[399_300,1_851],
  [439_230,1_921],[483_153,1_991],[531_468,2_061],[584_615,2_131],
  [643_077,2_201],[707_385,2_271],[778_124,2_341],
]

export function getPropertyScore(taxBase: number): number {
  const baseMan = taxBase / 10_000
  const deducted = baseMan - 10_000 // 기본공제 1억 (구 5천만에서 정정)
  if (deducted <= 0) return 0
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
const ASSESSED_RATIO = 0.6  // 공정시장가액비율 (주택 60%)
export function realEstatePropertyBases(
  assets: Asset[],
): { husband: { propertyTaxBase: number; rentalDeposit: number }; wife: { propertyTaxBase: number; rentalDeposit: number } } {
  let hp = 0, hd = 0, wp = 0, wd = 0
  for (const a of assets) {
    if (a.type !== 'REAL_ESTATE' || a.disposalDate) continue
    const d = a.detail as RealEstateDetail | undefined
    if (!d) continue
    const o = a.ownership ?? { husband: 50, wife: 50 }
    hp += a.currentValue * ASSESSED_RATIO * (o.husband / 100)
    wp += a.currentValue * ASSESSED_RATIO * (o.wife / 100)
    hd += (d.tenantDeposit ?? 0) * (o.husband / 100)
    wd += (d.tenantDeposit ?? 0) * (o.wife / 100)
  }
  return {
    husband: { propertyTaxBase: Math.round(hp), rentalDeposit: Math.round(hd) },
    wife: { propertyTaxBase: Math.round(wp), rentalDeposit: Math.round(wd) },
  }
}

/** STOCK 자산의 배당을 1인별로 분할 (월).
 *  summary의 per-asset monthlyKrw × 계좌명의(ownerByAccount). 계좌 없으면 자산별 ownership fallback. */
export function stockDividendsByOwner(
  assets: Asset[],
  summary: { items: { assetId: string; monthlyKrw: number }[] },
  ownerByAccount: Record<string, { husband: number; wife: number }> = {},
): { husband: number; wife: number } {
  const byId = new Map(summary.items.map((i) => [i.assetId, i.monthlyKrw]))
  let h = 0, w = 0
  for (const a of assets) {
    if (a.type !== 'STOCK' || a.disposalDate) continue
    const m = byId.get(a.id) ?? 0
    const d = a.detail as { accountName?: string } | undefined
    const acct = d?.accountName
    const o: { husband: number; wife: number } = (acct ? ownerByAccount[acct] : undefined) ?? a.ownership ?? { husband: 50, wife: 50 }
    h += m * (o.husband / 100)
    w += m * (o.wife / 100)
  }
  return { husband: Math.round(h), wife: Math.round(w) }
}

/** 계좌 이름으로 계좌 명의 조회 (없으면 fallback 또는 50:50). */
export function accountOwnership(
  accountName: string | undefined,
  ownerByAccount: Record<string, { husband: number; wife: number }>,
  fallback?: { husband: number; wife: number },
): { husband: number; wife: number } {
  if (accountName && ownerByAccount[accountName]) return ownerByAccount[accountName]
  return fallback ?? { husband: 50, wife: 50 }
}
