import { describe, it, expect } from 'vitest'
import { annualPension, resolvedAllocations } from './annualPension'
import { EMPTY_PENSION_PLAN, stockAccountBalances } from './pensionSim'
import { normalizeSavedPlan } from './retirementPlan'
import { pensionInputs } from './analysisInputs'
import { splitLumpsumStock, requestedStockAmount, dividendShare } from './lumpsumStock'
import type { LumpsumItem, PensionAllocation, PensionSimPlan } from '@/types'

// 목돈 분배 개편: 명의(owner)·배당투자 비율(stockDividendRatio)·행선지(destination)
const plan = (allocations: PensionAllocation[], over: Partial<PensionSimPlan> = {}): PensionSimPlan => ({
  ...EMPTY_PENSION_PLAN, sources: [], allocations, startYear: 2026, refYear: 2026, withdrawalYears: 3,
  stockAccount: {
    husband: { extraAmount: 0, dividendYield: 4, growthRate: 10 },
    wife: { extraAmount: 0, dividendYield: 4, growthRate: 10 },
  },
  stockOwnership: { husband: 60, wife: 40 },
  ...over,
})
const lump = (over: Partial<LumpsumItem> = {}): LumpsumItem => ({ id: 'j', name: '목돈', receiveYear: 2027, amount: 1_000_000_000, taxKind: 'other', ...over })
const alloc = (over: Partial<PensionAllocation> = {}): PensionAllocation => ({ lumpsumId: 'j', irpAmount: 0, stockAmount: 500_000_000, ...over })
const run = (p: PensionSimPlan, l: LumpsumItem[]) => annualPension(p, [], 2026, 2029, { currentYear: 2026, simulation: true, growth: 0, lumpsums: l }).rows

describe('lumpsumStock helpers', () => {
  it('미설정 = 기존(stockOwnership 분할, 전액 배당)', () => {
    expect(splitLumpsumStock(100, undefined, { husband: 60, wife: 40 }, {})).toEqual({ husband: { stock: 60, growthOnly: 0 }, wife: { stock: 40, growthOnly: 0 } })
    expect(dividendShare({})).toBe(1)
  })
  it('owner 지정 시 100% 그 사람, 배당 비율 50%면 절반이 일반투자', () => {
    expect(splitLumpsumStock(100, 'wife', { husband: 60, wife: 40 }, { stockDividendRatio: 50 })).toEqual({ husband: { stock: 0, growthOnly: 0 }, wife: { stock: 100, growthOnly: 50 } })
  })
  it('행선지 힌트: stock=목돈−IRP 전액, cash=0, 미설정=저장값', () => {
    expect(requestedStockAmount(alloc({ destination: 'stock', stockAmount: 1 }), 900)).toBe(900)
    expect(requestedStockAmount(alloc({ destination: 'cash' }), 900)).toBe(0)
    expect(requestedStockAmount(alloc({ stockAmount: 123 }), 900)).toBe(123)
  })
})

describe('annualPension — 목돈 명의·배당 비율', () => {
  it('신규 필드가 없으면 기존 결과와 동일 (stockOwnership 분할·전액 배당)', () => {
    const r = run(plan([alloc()]), [lump()])
    const y = r.find(x => x.year === 2027)!
    expect(y.financialHusbandAnnual).toBeCloseTo(300_000_000 * 0.04)
    expect(y.financialWifeAnnual).toBeCloseTo(200_000_000 * 0.04)
    expect(y.stockHusband).toBeCloseTo(300_000_000 * 1.1)
    // 명시적 100% 비율도 같은 결과
    const r100 = run(plan([alloc({ stockDividendRatio: 100 })]), [lump()])
    expect(r100.map(x => x.financialAnnual)).toEqual(r.map(x => x.financialAnnual))
  })
  it('owner=husband/wife 이면 해당 사람에게 100% 귀속', () => {
    const h = run(plan([alloc()]), [lump({ owner: 'husband' })]).find(x => x.year === 2027)!
    expect(h.financialHusbandAnnual).toBeCloseTo(20_000_000)
    expect(h.financialWifeAnnual).toBe(0)
    expect(h.stockWife).toBe(0)
    const w = run(plan([alloc()]), [lump({ owner: 'wife' })]).find(x => x.year === 2027)!
    expect(w.financialHusbandAnnual).toBe(0)
    expect(w.financialWifeAnnual).toBeCloseTo(20_000_000)
    expect(w.stockWife).toBeCloseTo(500_000_000 * 1.1)
  })
  it('배당 비율 50%는 목돈 배당을 절반으로, 원금 성장은 전액', () => {
    const full = run(plan([alloc()]), [lump({ owner: 'husband' })])
    const half = run(plan([alloc({ stockDividendRatio: 50 })]), [lump({ owner: 'husband' })])
    for (const year of [2027, 2028, 2029]) {
      const f = full.find(x => x.year === year)!, h = half.find(x => x.year === year)!
      expect(h.financialHusbandAnnual).toBeCloseTo(f.financialHusbandAnnual / 2)
      expect(h.stockHusband).toBeCloseTo(f.stockHusband)
    }
    // 배당 원금도 계좌 상승률로 성장 → 비율 유지
    expect(half.find(x => x.year === 2028)!.financialHusbandAnnual).toBeCloseTo(250_000_000 * 1.1 * 0.04)
  })
  it('기존 추가 금액(extraAmount)의 배당은 그대로, 목돈 일반투자 몫만 0%', () => {
    const p = plan([alloc({ stockDividendRatio: 0 })], { stockAccount: { husband: { extraAmount: 100_000_000, dividendYield: 4, growthRate: 0 }, wife: { extraAmount: 0, dividendYield: 4, growthRate: 0 } } })
    const y = run(p, [lump({ owner: 'husband' })]).find(x => x.year === 2027)!
    expect(y.financialHusbandAnnual).toBeCloseTo(4_000_000)
    expect(y.stockHusband).toBeCloseTo(600_000_000)
  })
  it('행선지 stock은 목돈 금액 변경을 따라가고 cash는 증권 0', () => {
    expect(resolvedAllocations(plan([alloc({ destination: 'stock', stockAmount: 1 })]), [lump()])[0].stockAmount).toBe(1_000_000_000)
    expect(resolvedAllocations(plan([alloc({ destination: 'cash' })]), [lump()])[0].stockAmount).toBe(0)
    expect(resolvedAllocations(plan([alloc()]), [lump({ owner: 'wife' })])[0].owner).toBe('wife')
  })
})

describe('stockAccountBalances — 명의·배당 비율', () => {
  it('lumpsums 미제공·신규 필드 없음은 기존과 동일', () => {
    const sb = stockAccountBalances(plan([alloc()]))
    expect(sb.husband.total).toBe(300_000_000)
    expect(sb.husband.dividendBase).toBe(12_000_000)
    expect(stockAccountBalances(plan([alloc()]), [lump()]).husband).toEqual(sb.husband)
  })
  it('owner·배당 비율 반영: 배당 기준은 배당투자 몫만', () => {
    const sb = stockAccountBalances(plan([alloc({ stockDividendRatio: 50 })]), [lump({ owner: 'wife' })])
    expect(sb.husband.total).toBe(0)
    expect(sb.wife.total).toBe(500_000_000)
    expect(sb.wife.growthOnly).toBe(250_000_000)
    expect(sb.wife.dividendBase).toBe(10_000_000)
  })
})

describe('저장 호환 — 신규 필드 보존', () => {
  it('normalizeSavedPlan 은 목돈 owner 를 보존하고, 기존 목돈은 그대로', () => {
    const p = normalizeSavedPlan({ lumpsum: [lump({ owner: 'wife' }), { id: 'old', name: '전세', receiveYear: 2030, amount: 1 }] })
    expect(p.lumpsum[0].owner).toBe('wife')
    expect(p.lumpsum[1].owner).toBeUndefined()
  })
  it('pensionInputs 는 분배의 destination·stockDividendRatio 를 보존', () => {
    const saved = plan([alloc({ destination: 'partial', stockDividendRatio: 30 })])
    expect(pensionInputs(saved, []).allocations[0]).toMatchObject({ destination: 'partial', stockDividendRatio: 30 })
  })
})
