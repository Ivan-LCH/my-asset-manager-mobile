import { describe, it, expect } from 'vitest'
import {
  estimateHoldingTax, holdingTaxByYear, comprehensiveTaxGross, housingPropertyTax,
  type HoldingTaxAssetInput,
} from '@/lib/holdingTax'

const house = (over: Partial<HoldingTaxAssetInput> = {}): HoldingTaxAssetInput => ({
  currentValue: 0,
  ownership: { husband: 50, wife: 50 },
  ...over,
})
const EOK = 100_000_000  // 1억

describe('holdingTax (보유세 추정)', () => {
  it('빈 자산 → 0', () => {
    const r = estimateHoldingTax([], 2030)
    expect(r.total).toBe(0)
    expect(r.husband.total).toBe(0)
    expect(r.wife.total).toBe(0)
  })

  it('재산세 구간 경계 (과표 6천만/1.5억/3억)', () => {
    // m2o=1 → 공시=currentValue, 남편 100%
    const at = (official: number) =>
      estimateHoldingTax([house({ currentValue: official, ownership: { husband: 100, wife: 0 } })], 2030, { marketToOfficial: 1 })
    // 공시 1억 → 과표 6천만: 본세 6만 + 교육 1.2만 + 도시 8.4만 = 15.6만
    expect(at(1 * EOK).husband.total).toBe(156_000)
    // 공시 2.5억 → 과표 1.5억: 본세 19.5만 + 교육 3.9만 + 도시 21만 = 44.4만
    expect(at(2.5 * EOK).husband.total).toBe(444_000)
    // 공시 5억 → 과표 3억: 본세 57만 + 교육 11.4만 + 도시 42만 = 110.4만
    expect(at(5 * EOK).husband.total).toBe(1_104_000)
    expect(at(5 * EOK).wife.total).toBe(0)
  })

  it('앵커: 공시 9억 1주택 자가 → 연 ≈259만 (재산세 153만+교육 30.6만+도시 75.6만, 종부세 0)', () => {
    // m2o=1: 공시 9억
    const r1 = estimateHoldingTax([house({ currentValue: 9 * EOK, ownership: { husband: 100, wife: 0 }, isOwned: true })], 2030, { marketToOfficial: 1 })
    expect(r1.husband.propertyTax).toBe(1_530_000)
    expect(r1.husband.comprehensiveTax).toBe(0)   // 일반공제 9억으로 과표 0
    expect(r1.husband.total).toBe(2_592_000)
    // 기본 m2o(0.75): 시가 12억 → 공시 9억 → 동일
    const r2 = estimateHoldingTax([house({ currentValue: 12 * EOK, ownership: { husband: 100, wife: 0 }, isOwned: true })], 2030)
    expect(r2.husband.total).toBe(2_592_000)
  })

  it('종부세: 자가 체크만으로 1세대1주택 특례를 확정하지 않는다', () => {
    const r = estimateHoldingTax([house({ currentValue: 30 * EOK, ownership: { husband: 100, wife: 0 }, isOwned: true })], 2030, { marketToOfficial: 1 })
    // 과표 (30억−9억)×0.6 = 12.6억 → 산출 1,038만 − 재산세 공제 추정 239.4만
    expect(r.husband.comprehensiveTax).toBe(7_986_000)
    expect(r.husband.propertyTax).toBe(6_570_000)
  })

  it('종부세: 부부 각자 공시가격과 공제·누진세율을 적용한다', () => {
    const r = estimateHoldingTax([
      house({ currentValue: 15 * EOK, ownership: { husband: 100, wife: 0 } }),
      house({ currentValue: 15 * EOK, ownership: { husband: 0, wife: 100 } }),
    ], 2030, { marketToOfficial: 1 })
    // 각 인별 (15억−9억)×0.6 = 3.6억 → 산출 192만 − 공제 추정 36만 = 156만
    expect(r.husband.comprehensiveTax).toBe(1_560_000)
    expect(r.wife.comprehensiveTax).toBe(1_560_000)
    expect(r.husband.total).toBe(r.wife.total)
    expect(r.total).toBe(Math.round(r.husband.total + r.wife.total))
    expect(r.total).toBeGreaterThan(2 * r.husband.propertyTax)  // 종부세 반영 확인
  })

  it('futureValue 스위치: 재건축 입주 연도(futureYear)부터 예상 가치 반영', () => {
    const a = house({ currentValue: 5 * EOK, futureValue: 20 * EOK, futureYear: 2030, ownership: { husband: 100, wife: 0 }, isOwned: true })
    const before = estimateHoldingTax([a], 2029, { marketToOfficial: 1 })
    const after = estimateHoldingTax([a], 2030, { marketToOfficial: 1 })
    expect(before.husband.propertyTax).toBe(0) // 주택 전환 전 토지세 미확정, 면세 아님
    expect(before.incomplete).toBe(true)
    expect(after.husband.propertyTax).toBe(4_170_000)         // 과표 12억(공시 20억)
    expect(after.husband.total).toBeGreaterThan(before.husband.total * 4)
  })

  it('6월 1일 전에 처분한 주택은 그해 보유세에서도 제외', () => {
    const a = house({ currentValue: 9 * EOK, disposalDate: '2031-03-15', ownership: { husband: 100, wife: 0 } })
    expect(estimateHoldingTax([a], 2031, { marketToOfficial: 1 }).total).toBe(0)
    expect(estimateHoldingTax([a], 2032, { marketToOfficial: 1 }).total).toBe(0)
  })

  it('holdingTaxByYear: 연도 범위 Map + 처분 반영', () => {
    const a = house({ currentValue: 5 * EOK, futureValue: 20 * EOK, futureYear: 2030, ownership: { husband: 100, wife: 0 } })
    const m = holdingTaxByYear([a], 2029, 2033, { marketToOfficial: 1 })
    expect([...m.keys()]).toEqual([2029, 2030, 2031, 2032, 2033])
    expect(m.get(2030)!).toBeGreaterThan(m.get(2029)!)   // 입주 전환
    expect(m.get(2031)).toBe(m.get(2030))                // 이후 동일
  })

  it('순수 함수: 재산세·종부세 누진공제 연속성', () => {
    expect(housingPropertyTax(60_000_000)).toBe(60_000)
    expect(housingPropertyTax(150_000_000)).toBe(195_000)
    expect(housingPropertyTax(300_000_000)).toBe(570_000)
    expect(comprehensiveTaxGross(300_000_000)).toBeCloseTo(comprehensiveTaxGross(300_000_001), -1)
    expect(comprehensiveTaxGross(600_000_000)).toBe(3_600_000)
    expect(comprehensiveTaxGross(1_200_000_000)).toBe(9_600_000)
    expect(comprehensiveTaxGross(4_500_000_000)).toBe(56_500_000)
    expect(comprehensiveTaxGross(0)).toBe(0)
  })
})
