// 보유세(재산세 + 종합부동산세) 자동 추정 — 부동산 자산에서 산출.
// 2025~26년 현행 세율 기반 근사 추정 (시가→공시 75% 가정). 세무사 확인 필수.
// 미구현(근사 한계): 3주택 이상 중과세율, 장기보유·연령 공제, 세부담상한제, 2026 개편안.
import type { Asset, RealEstateDetail } from '@/types'

/** 시가 → 공시가격 근사 비율 (공시가격 ≈ 시가의 75% 가정). */
export const MARKET_TO_OFFICIAL = 0.75
/** 주택 공정시장가액비율 — 재산세·종부세 과표 = 공시 × 60%. */
export const HOUSING_ASSESSED_RATIO = 0.6
/** 도시재산세율 — 과밀억제권역(서울 등) 기본 0.14%. */
export const URBAN_TAX_RATE_METRO = 0.0014
/** 종부세 기본공제(공시가격 기준): 1세대1주택(자가 거주) 12억 / 일반(2주택 이하) 9억. */
export const DEDUCTION_ONE_HOUSE_OWNED = 1_200_000_000
export const DEDUCTION_GENERAL = 900_000_000

export interface HoldingTaxAssetInput {
  currentValue: number
  futureValue?: number   // 재건축 입주 후 예상 가치
  futureYear?: number    // 재건축 입주(완공) 예정 연도
  ownership: { husband: number; wife: number }   // 명의 지분 %
  isOwned?: boolean      // 자가(거주) 여부 — 1세대1주택 특별공제 판정
  disposalDate?: string  // 처분일 — 해당 연도가 처분 이후면 제외
}

export interface HoldingTaxBreakdown {
  propertyTax: number      // 재산세(본세)
  educationTax: number     // 지방교육세 (재산세 본세 + 종부세 본세의 20%)
  urbanPropertyTax: number // 도시재산세 (과표 × 0.14%)
  comprehensiveTax: number // 종부세 납부세액 (본세, 재산세 본세 공제 후)
  total: number
}

export interface HoldingTaxOptions {
  marketToOfficial?: number  // 기본 0.75 (테스트에서 1로 지정 시 시가=공시)
  urbanRate?: number         // 기본 0.0014 (과밀억제권역). 비과밀 0.0009
}

export interface HoldingTaxResult {
  husband: HoldingTaxBreakdown
  wife: HoldingTaxBreakdown
  total: number
}

/** Asset[] → 보유세 입력 (REAL_ESTATE만, detail의 재건축·자가 여부 반영). */
export function toHoldingTaxAssets(assets: Asset[]): HoldingTaxAssetInput[] {
  const out: HoldingTaxAssetInput[] = []
  for (const a of assets) {
    if (a.type !== 'REAL_ESTATE') continue
    const d = a.detail as RealEstateDetail | undefined
    out.push({
      currentValue: a.currentValue,
      futureValue: d?.futureValue,
      futureYear: d?.futureYear,
      ownership: a.ownership ?? { husband: 50, wife: 50 },
      isOwned: d?.isOwned,
      disposalDate: a.disposalDate,
    })
  }
  return out
}

/** 해당 연도 기준 자산 가치 — 재건축 입주(futureYear) 이후면 futureValue로 전환. */
function valueAt(a: HoldingTaxAssetInput, year: number): number {
  const useFuture = a.futureValue != null && a.futureYear != null && year >= a.futureYear
  return useFuture ? (a.futureValue as number) : a.currentValue
}

/** 처분 연도 파싱 ('2027-05' → 2027). */
function disposalYear(a: HoldingTaxAssetInput): number | null {
  if (!a.disposalDate) return null
  const y = Number(String(a.disposalDate).slice(0, 4))
  return Number.isFinite(y) && y > 0 ? y : null
}

/** 주택 재산세 본세 — 과표(공시×60%) 구간 누진.
 *  ≤6천만 0.10% / ~1.5억 6만+초과×0.15% / ~3억 19.5만+초과×0.25% / 3억~ 57만+초과×0.40% */
export function housingPropertyTax(base: number): number {
  if (base <= 60_000_000) return base * 0.0010
  if (base <= 150_000_000) return 60_000 + (base - 60_000_000) * 0.0015
  if (base <= 300_000_000) return 195_000 + (base - 150_000_000) * 0.0025
  return 570_000 + (base - 300_000_000) * 0.0040
}

/** 종부세 산출세액 — 과표 구간 누진 (2주택 이하 세율).
 *  ≤3억 0.5% / ~6억 0.7%(누진공제 60만) / ~12억 1.0%(240만) / ~45억 2.0%(1,440만) / 45억~ 2.7%(4,590만) */
export function comprehensiveTaxGross(taxable: number): number {
  if (taxable <= 0) return 0
  if (taxable <= 300_000_000) return taxable * 0.005
  if (taxable <= 600_000_000) return taxable * 0.007 - 600_000
  if (taxable <= 1_200_000_000) return taxable * 0.010 - 2_400_000
  if (taxable <= 4_500_000_000) return taxable * 0.020 - 14_400_000
  return taxable * 0.027 - 45_900_000
}

/** 해당 연도 보유세 추정 — 재산세는 인별(지분별) 과세, 종부세는 가구 합산 후 지분 배분.
 *  입력은 toHoldingTaxAssets(assets) 또는 테스트에서 직접 구성. */
export function estimateHoldingTax(
  assets: HoldingTaxAssetInput[],
  year: number,
  opts: HoldingTaxOptions = {},
): HoldingTaxResult {
  const m2o = opts.marketToOfficial ?? MARKET_TO_OFFICIAL
  const urbanRate = opts.urbanRate ?? URBAN_TAX_RATE_METRO

  const blank = (): HoldingTaxBreakdown => ({ propertyTax: 0, educationTax: 0, urbanPropertyTax: 0, comprehensiveTax: 0, total: 0 })
  const res: HoldingTaxResult = { husband: blank(), wife: blank(), total: 0 }
  const houses = assets.filter((a) => {
    const dy = disposalYear(a)
    return !(dy != null && year > dy)   // 처분 이후 연도면 제외
  })
  if (houses.length === 0) return res

  let officialHusband = 0   // 인별 공시가격 합 (종부세 배분 비율용)
  let officialWife = 0
  let propertyTaxTotal = 0  // 가구 재산세 본세 합 (종부세 공제용)

  // ── 재산세: 주택별·인별(지분) 과세 ──
  for (const a of houses) {
    const official = valueAt(a, year) * m2o            // 공시가격 추정
    const base = official * HOUSING_ASSESSED_RATIO     // 재산세 과표
    const hs = (a.ownership?.husband ?? 50) / 100
    const ws = (a.ownership?.wife ?? 50) / 100
    const hBase = base * hs
    const wBase = base * ws
    const hTax = housingPropertyTax(hBase)
    const wTax = housingPropertyTax(wBase)
    res.husband.propertyTax += hTax
    res.wife.propertyTax += wTax
    res.husband.urbanPropertyTax += hBase * urbanRate
    res.wife.urbanPropertyTax += wBase * urbanRate
    officialHusband += official * hs
    officialWife += official * ws
    propertyTaxTotal += hTax + wTax
  }

  // ── 종부세: 가구(부부) 합산 — 과표 = (공시 합계 − 기본공제) × 60% ──
  // 기본공제(공시 기준): 1주택 자가 거주 12억 / 그 외(2주택 이하) 9억.
  // ※ 3주택 이상 중과(공제 3억·세율 상향)는 미반영 — 실제보다 과소 추정.
  const officialTotal = officialHusband + officialWife
  const deduction = houses.length === 1 && houses[0].isOwned ? DEDUCTION_ONE_HOUSE_OWNED : DEDUCTION_GENERAL
  const compTaxable = Math.max(0, officialTotal - deduction) * HOUSING_ASSESSED_RATIO
  const compGross = comprehensiveTaxGross(compTaxable)
  // 납부세액 = 산출세액 − 재산세 본세 (지방교육세·도시재산세는 공제 제외, 본세 기준)
  const compNet = Math.max(0, compGross - propertyTaxTotal)
  const shareSum = officialHusband + officialWife
  if (shareSum > 0) {
    res.husband.comprehensiveTax += compNet * (officialHusband / shareSum)
    res.wife.comprehensiveTax += compNet * (officialWife / shareSum)
  }

  // ── 지방교육세: (재산세 본세 + 종부세 본세) × 20% ──
  for (const who of [res.husband, res.wife] as const) {
    who.educationTax = (who.propertyTax + who.comprehensiveTax) * 0.20
    who.total = who.propertyTax + who.educationTax + who.urbanPropertyTax + who.comprehensiveTax
  }
  res.total = res.husband.total + res.wife.total

  // 원 단위 반올림
  for (const who of [res.husband, res.wife] as const) {
    who.propertyTax = Math.round(who.propertyTax)
    who.educationTax = Math.round(who.educationTax)
    who.urbanPropertyTax = Math.round(who.urbanPropertyTax)
    who.comprehensiveTax = Math.round(who.comprehensiveTax)
    who.total = Math.round(who.total)
  }
  res.total = Math.round(res.total)
  return res
}

/** 연도 범위별 보유세 합계(가구) Map — 현금흐름 연동용. */
export function holdingTaxByYear(
  assets: HoldingTaxAssetInput[],
  fromYear: number,
  toYear: number,
  opts?: HoldingTaxOptions,
): Map<number, number> {
  const map = new Map<number, number>()
  for (let y = fromYear; y <= toYear; y++) {
    map.set(y, estimateHoldingTax(assets, y, opts).total)
  }
  return map
}
