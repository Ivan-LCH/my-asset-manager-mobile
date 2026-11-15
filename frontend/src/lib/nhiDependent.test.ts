import { describe, it, expect } from 'vitest'
import {
  analyzeDependent, countableIncome, dependentWindow, evaluateDependent, isJeonseLumpsum, rebalanceJeonse,
  DEPENDENT_INCOME_LIMIT, DEPENDENT_PROPERTY_LIMIT, DEPENDENT_PROPERTY_HARD_LIMIT, FINANCIAL_INCOME_EXEMPTION,
} from '@/lib/nhiDependent'

describe('dependentWindow', () => {
  it('남편 은퇴 연도 이상 ~ 와이프 은퇴 연도 미만', () => {
    expect(dependentWindow(2035, 2040)).toEqual({ start: 2035, end: 2039 })
  })
  it('같은 해·먼저 은퇴·미입력이면 null', () => {
    expect(dependentWindow(2035, 2035)).toBeNull()
    expect(dependentWindow(2035, 2030)).toBeNull()
    expect(dependentWindow(2035, null)).toBeNull()
    expect(dependentWindow(2035, undefined)).toBeNull()
  })
})

describe('isJeonseLumpsum', () => {
  it('전세/보증금 포함, 공백 허용', () => {
    expect(isJeonseLumpsum('전세금 반환')).toBe(true)
    expect(isJeonseLumpsum('임차 보 증 금')).toBe(true)
    expect(isJeonseLumpsum('퇴직금')).toBe(false)
  })
})

describe('countableIncome / evaluateDependent', () => {
  it('공적연금 100% 반영, 사적연금 제외', () => {
    const c = countableIncome({ publicPension: 12_000_000, financial: 0, privatePension: 50_000_000 })
    expect(c.publicPension).toBe(12_000_000)
    expect(c.countable).toBe(12_000_000)
    expect(c.privatePensionExcluded).toBe(50_000_000)
  })
  it('금융소득 1천만 원 이하 0, 초과 시 전액(절벽)', () => {
    expect(countableIncome({ publicPension: 0, financial: FINANCIAL_INCOME_EXEMPTION }).countable).toBe(0)
    expect(countableIncome({ publicPension: 0, financial: FINANCIAL_INCOME_EXEMPTION + 1 }).countable).toBe(10_000_001)
  })
  it('기타소득 포함', () => {
    expect(countableIncome({ publicPension: 5_000_000, financial: 0, other: 3_000_000 }).countable).toBe(8_000_000)
  })
  it('소득 2천만 원 이하 eligible, 초과 ineligible (재산 5.4억 이하)', () => {
    expect(evaluateDependent({ publicPension: DEPENDENT_INCOME_LIMIT, financial: 0 }, 100_000_000).status).toBe('eligible')
    expect(evaluateDependent({ publicPension: DEPENDENT_INCOME_LIMIT + 1, financial: 0 }, 100_000_000).status).toBe('ineligible')
  })
  it('재산 5.4억 초과~9억: 소득 1천만 원 이하만', () => {
    const mid = DEPENDENT_PROPERTY_LIMIT + 1
    expect(evaluateDependent({ publicPension: 10_000_000, financial: 0 }, mid).status).toBe('eligible')
    expect(evaluateDependent({ publicPension: 10_000_001, financial: 0 }, mid).status).toBe('ineligible')
    expect(evaluateDependent({ publicPension: 0, financial: 0 }, DEPENDENT_PROPERTY_HARD_LIMIT).status).toBe('eligible')
  })
  it('재산 9억 초과는 불가, 5.4억 경계는 하위 구간', () => {
    expect(evaluateDependent({ publicPension: 0, financial: 0 }, DEPENDENT_PROPERTY_HARD_LIMIT + 1).status).toBe('ineligible')
    expect(evaluateDependent({ publicPension: 15_000_000, financial: 0 }, DEPENDENT_PROPERTY_LIMIT).status).toBe('eligible')
  })
  it('부동산 자료 없음 → 소득 통과 시 unknown, 초과 시 ineligible', () => {
    expect(evaluateDependent({ publicPension: 5_000_000, financial: 0 }, null).status).toBe('unknown')
    expect(evaluateDependent({ publicPension: 25_000_000, financial: 0 }, null).status).toBe('ineligible')
  })
})

describe('rebalanceJeonse', () => {
  const base = { publicPension: 8_000_000, nonJeonseFinancial: 2_000_000, husbandShare: 1, dividendYieldPct: 4, propertyBase: 100_000_000 }
  it('배당을 줄여 금융소득을 1천만 원 이하로, 현금은 그대로', () => {
    const r = rebalanceJeonse({ ...base, jeonseStock: 500_000_000, jeonseCash: 100_000_000 })
    // (10M-2M)/4% = 2억
    expect(r.mode).toBe('under-cliff')
    expect(r.allocation).toEqual({ dividendAmount: 200_000_000, growthAmount: 300_000_000, cashAmount: 100_000_000 })
    expect(r.result.income.financial).toBeLessThanOrEqual(FINANCIAL_INCOME_EXEMPTION)
    expect(r.result.status).toBe('eligible')
  })
  it('현재 주식 몫이 한도보다 작으면 전부 배당 유지', () => {
    const r = rebalanceJeonse({ ...base, jeonseStock: 100_000_000 })
    expect(r.allocation).toMatchObject({ dividendAmount: 100_000_000, growthAmount: 0 })
  })
  it('남편 지분이 50%이면 배당 가능 원금이 두 배', () => {
    const r = rebalanceJeonse({ ...base, husbandShare: 0.5, jeonseStock: 900_000_000 })
    expect(r.allocation!.dividendAmount).toBe(400_000_000)
  })
  it('배당률 0이면 제한 없음', () => {
    const r = rebalanceJeonse({ ...base, dividendYieldPct: 0, jeonseStock: 300_000_000 })
    expect(r.mode).toBe('unconstrained')
    expect(r.allocation!.dividendAmount).toBe(300_000_000)
  })
  it('기존 금융소득이 이미 1천만 원 초과면 상한까지(전액 반영 구간)', () => {
    const r = rebalanceJeonse({ ...base, publicPension: 2_000_000, nonJeonseFinancial: 12_000_000, jeonseStock: 500_000_000 })
    // 20M - 2M - 12M = 6M → 1.5억
    expect(r.mode).toBe('over-cliff')
    expect(r.allocation!.dividendAmount).toBe(150_000_000)
    expect(r.result.income.countable).toBeLessThanOrEqual(DEPENDENT_INCOME_LIMIT)
  })
  it('국민연금만으로 2천만 원 초과면 불가 — 임의 배분 없음', () => {
    const r = rebalanceJeonse({ ...base, publicPension: 21_000_000, jeonseStock: 300_000_000 })
    expect(r.mode).toBe('infeasible')
    expect(r.allocation).toBeNull()
    expect(r.result.status).toBe('ineligible')
  })
  it('재산 9억 초과면 불가', () => {
    const r = rebalanceJeonse({ ...base, propertyBase: 950_000_000, jeonseStock: 300_000_000 })
    expect(r.allocation).toBeNull()
    expect(r.result.status).toBe('ineligible')
  })
  it('재산 5.4~9억 구간은 소득 1천만 원 기준: 연금 9백만 원이면 금융소득 0까지만 허용(절벽)', () => {
    const r = rebalanceJeonse({ ...base, propertyBase: 600_000_000, publicPension: 9_000_000, nonJeonseFinancial: 0, jeonseStock: 500_000_000 })
    // 금융소득 1천만 원 이하는 0 반영이므로 under-cliff 상한 2.5억
    expect(r.allocation!.dividendAmount).toBe(250_000_000)
    expect(r.result.status).toBe('eligible')
  })
  it('전세 주식 몫 없음', () => {
    const r = rebalanceJeonse({ ...base, jeonseStock: 0 })
    expect(r.allocation).toBeNull()
    expect(r.mode).toBe('none')
    expect(r.result.status).toBe('eligible')
  })
})

describe('analyzeDependent', () => {
  const rows = [2035, 2036, 2037].map(year => ({ year, husbandPublicPension: 6_000_000, husbandPrivatePension: 30_000_000, husbandFinancial: 20_000_000 + 2_000_000 }))
  const args = {
    hasSpouse: true, husbandRetirementYear: 2035, wifeRetirementYear: 2037, rows, otherIncome: 0,
    propertyBase: () => 100_000_000 as number | null,
    jeonse: [{ id: 'j', name: '전세금 반환', receiveYear: 2035, amount: 600_000_000, irpAmount: 0, stockAmount: 500_000_000 }],
    jeonseFound: true, husbandShare: 1, dividendYieldPct: 4, allocationsApplied: true,
  }
  it('피부양자 기간(2035~2036)만 계산, 사적연금 제외, 전세 몫 분리', () => {
    const a = analyzeDependent(args)
    expect(a.status).toBe('active')
    expect(a.window).toEqual({ start: 2035, end: 2036 })
    expect(a.years.map(y => y.year)).toEqual([2035, 2036])
    const y = a.years[0]
    expect(y.current.income.privatePensionExcluded).toBe(30_000_000)
    expect(y.current.status).toBe('ineligible') // 금융소득 2200만 원 전액 반영 + 연금 600만 원
    expect(y.jeonseDividend).toBe(20_000_000)
    expect(y.jeonseCash).toBe(100_000_000)
    expect(y.rebalance.allocation).toEqual({ dividendAmount: 200_000_000, growthAmount: 300_000_000, cashAmount: 100_000_000 })
    expect(y.rebalance.result.status).toBe('eligible')
  })
  it('와이프 연도 미입력 / 미혼 / 같은 해', () => {
    expect(analyzeDependent({ ...args, wifeRetirementYear: null }).status).toBe('wife-year-missing')
    expect(analyzeDependent({ ...args, hasSpouse: false }).status).toBe('no-spouse')
    expect(analyzeDependent({ ...args, wifeRetirementYear: 2035 }).status).toBe('not-later')
  })
  it('전세 목돈 없음 → 재배분 없이 기존 기준 판정', () => {
    const a = analyzeDependent({ ...args, jeonse: [], jeonseFound: false, rows: rows.map(r => ({ ...r, husbandFinancial: 3_000_000 })) })
    expect(a.years[0].rebalance.allocation).toBeNull()
    expect(a.years[0].current.status).toBe('eligible')
    expect(a.notes.some(n => n.includes('전세'))).toBe(true)
  })
  it('부동산 자료 없으면 unknown', () => {
    const a = analyzeDependent({ ...args, propertyBase: () => null, jeonse: [], jeonseFound: false, rows: rows.map(r => ({ ...r, husbandFinancial: 0 })) })
    expect(a.years[0].current.status).toBe('unknown')
  })
})
