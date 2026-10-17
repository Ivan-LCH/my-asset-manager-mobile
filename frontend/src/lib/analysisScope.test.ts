// 4단계 1 후속 — 은퇴 분석에 합산 기준 적용 (합성 데이터만, 실데이터 회귀는 analysisScope-backup.test.ts)
// 훅(useAnalysisEngine)과 같은 경로: buildSnapshot → analysisScope → scopeInputs → pensionInputs → annualPension
import { describe, it, expect } from 'vitest'
import type { Asset, DividendSummary, PensionSimPlan } from '@/types'
import { blankPlan, buildSnapshot, policySchema, type PlannerPlan } from '@/planner/model'
import { analysisScope, scopeInputs, EMPTY_SCOPE } from './analysisScope'
import { pensionInputs } from './analysisInputs'
import { annualPension } from './annualPension'
import { EMPTY_PENSION_PLAN } from './pensionSim'
import type { MonthlyPensionPlan } from './monthlyPensionPlan'

const AS_OF = '2026-10-15'
const asset = (id: string, type: Asset['type'], value: number, detail: any = {}): Asset => ({
  id, type, name: id, currentValue: value, acquisitionDate: '2020-01-01', acquisitionPrice: value, quantity: 1,
  ownership: { husband: 100, wife: 0 }, createdAt: '', updatedAt: '', history: [], detail,
})
const pension = (id: string, pensionType: string, value: number, extra: any = {}) =>
  asset(id, 'PENSION', value, { pensionType, expectedStartYear: 2030, expectedEndYear: 2050, expectedMonthlyPayout: 1_000_000, annualGrowthRate: 0, ...extra })
const fixture = () => [
  asset('apt', 'REAL_ESTATE', 900_000_000),
  pension('private', '개인연금', 50_000_000),
  pension('nps', '국민연금', 0),
  pension('wrapper', '퇴직연금', 0, { linkedStockId: 'IRP계좌' }),
  asset('irpStock', 'STOCK', 30_000_000, { accountName: 'IRP계좌' }),
  asset('stk', 'STOCK', 10_000_000, { accountName: '일반' }),
  asset('stk2', 'STOCK', 10_000_000, { accountName: '일반' }),
]
const plan = (policies: Record<string, Partial<{ role: string; linkedTo: string }>>): PlannerPlan =>
  ({ ...blankPlan(AS_OF), policies: Object.entries(policies).map(([assetId, p]) => policySchema.parse({ assetId, ...p })) })
const snap = (assets: Asset[], p: PlannerPlan) => buildSnapshot(assets, { currentAge: 50, retirementAge: 60 } as any, p, AS_OF + 'T00:00:00Z')
const div = (): DividendSummary => {
  const item = (assetId: string, monthlyKrw: number) => ({ assetId, name: assetId, accountName: '일반', currency: 'KRW', exchangeRate: 1, dividendYield: 3, dividendDps: 0, dividendCycle: '', annualKrw: monthlyKrw * 12, monthlyKrw })
  return { items: [item('stk', 25_000), item('stk2', 25_000)], totalAnnual: 600_000, totalMonthly: 50_000 }
}
const monthlyPlan = (): MonthlyPensionPlan => ({ version: 1, recordedAt: AS_OF, retirementDate: '2029-12-31', notes: [],
  accounts: [{ sourceId: 'private', label: '개인연금', role: 'insurance', annualTotalReturn: 0, payout: 'fixed', start: '2030-01', end: '2049-12', monthlyAmount: 1_000_000, annualIncrease: 0, contributions: [] }],
  transfers: [], deposits: [] })
const sim = (withMonthly = false): PensionSimPlan => ({ ...structuredClone(EMPTY_PENSION_PLAN),
  sources: [
    { id: 'private', name: 'private', principal: 50_000_000, taxType: 'irp', owner: 'husband', yieldRate: 0, taxTypeManual: true },
    { id: 'nps', name: 'nps', principal: 0, taxType: 'national', owner: 'husband', yieldRate: 0, taxTypeManual: true },
  ] as any,
  ...(withMonthly ? { monthlyPlan: monthlyPlan() } : {}) })
/** 훅과 같은 순서로 연금 일정 계산 (연금시뮬 연동 모드) */
const project = (assets: Asset[], policies: PlannerPlan, withMonthly = false) => {
  const scoped = scopeInputs({ assets, dividends: div(), pensionSim: sim(withMonthly) }, analysisScope(snap(assets, policies)))
  const inputs = pensionInputs(scoped.pensionSim, scoped.assets, 2029)
  const projection = annualPension(inputs, scoped.assets, 2026, 2060, { currentYear: 2026, simulation: true, growth: 0, dividend: 0 })
  const paid = (year: number, id: string) => projection.rows.find(r => r.year === year)!.entries.find(e => e.id === id)?.paid ?? 0
  return { scoped, inputs, projection, paid }
}

describe('analysisScope — 합산 기준을 은퇴 분석 입력에 적용', () => {
  it('저장 정책이 없으면(기본 분류) 아무것도 빼지 않고 입력을 그대로 돌려준다', () => {
    const assets = fixture(), d = div(), s = sim()
    const scope = analysisScope(snap(assets, plan({})))
    expect(scope.dropIds.size).toBe(0)
    expect(scope.notes).toEqual([])            // 기본 래퍼(linkedAccount)는 안내 대상이 아니다
    const out = scopeInputs({ assets, dividends: d, pensionSim: s }, scope)
    expect(out.assets).toBe(assets); expect(out.dividends).toBe(d); expect(out.pensionSim).toBe(s)
    expect(analysisScope(null)).toBe(EMPTY_SCOPE)
  })

  it('규칙 4: 제외한 개인연금은 잔액·지급과 저장 소스까지 빠진다 (수동 소스로 살아남지 않음)', () => {
    const before = project(fixture(), plan({}))
    const after = project(fixture(), plan({ private: { role: 'excluded' } }))
    expect(before.inputs.sources.some(s => s.id === 'private')).toBe(true)
    expect(after.scoped.assets.some(a => a.id === 'private')).toBe(false)
    expect(after.inputs.sources.some(s => s.id === 'private')).toBe(false)
    expect(before.paid(2031, 'private')).toBeGreaterThan(0)
    expect(after.paid(2031, 'private')).toBe(0)
    expect(after.scoped.notes[0]).toContain('private 합산 제외')
  })

  it('규칙 4: 월별 계획 계좌도 걸러 "연결 자산 확인 필요"·incomplete 가 생기지 않는다', () => {
    const before = project(fixture(), plan({}), true)
    expect(before.paid(2031, 'private')).toBe(12_000_000)
    const after = project(fixture(), plan({ private: { role: 'excluded' } }), true)
    expect(after.scoped.pensionSim!.monthlyPlan!.accounts).toEqual([])
    expect(after.projection.notes.some(n => n.includes('연결 자산 확인 필요'))).toBe(false)
    expect(after.projection.incomplete).toBe(false)
    expect(after.paid(2031, 'private')).toBe(0)
  })

  it('규칙 4: linkedTo 개인연금도 같게 빠진다 (잔액은 원본 자산이 가짐)', () => {
    const after = project(fixture(), plan({ private: { role: 'pension', linkedTo: 'stk' } }))
    expect(after.scoped.assets.some(a => a.id === 'private')).toBe(false)
    expect(after.scoped.notes[0]).toContain('private 연결 잔액')
  })

  it('규칙 2: 제외·연결한 국민연금은 지급과 저장 소스를 유지하고 안내만 한다', () => {
    const before = project(fixture(), plan({}))
    for (const p of [{ role: 'excluded' }, { role: 'entitlement', linkedTo: 'private' }]) {
      const after = project(fixture(), plan({ nps: p }))
      expect(after.scoped.assets.some(a => a.id === 'nps')).toBe(true)
      expect(after.inputs.sources.some(s => s.id === 'nps')).toBe(true)
      expect(after.paid(2031, 'nps')).toBe(before.paid(2031, 'nps'))
      expect(after.scoped.notes).toEqual([expect.stringMatching(/^nps: .*연금 지급은 그대로 반영/)])
    }
  })

  it('규칙 1: 제외·연결한 부동산은 보유세·건보 재산 산정에 남기고 안내한다', () => {
    for (const p of [{ role: 'excluded' }, { role: 'property', linkedTo: 'stk' }]) {
      const scope = analysisScope(snap(fixture(), plan({ apt: p })))
      expect(scope.dropIds.size).toBe(0)
      const out = scopeInputs({ assets: fixture(), dividends: div(), pensionSim: sim() }, scope)
      expect(out.assets.some(a => a.id === 'apt')).toBe(true)
      expect(out.notes).toEqual([expect.stringMatching(/^apt: .*보유세·건강보험 재산 산정에는 포함/)])
    }
  })

  it('규칙 3: 연결 연금 래퍼 제외는 무시하고, 계좌 종목을 제외하라고 안내한다', () => {
    const before = project(fixture(), plan({}))
    const after = project(fixture(), plan({ wrapper: { role: 'excluded' } }))
    expect(after.scoped.assets.some(a => a.id === 'wrapper')).toBe(true)
    expect(after.paid(2031, 'wrapper')).toBe(before.paid(2031, 'wrapper'))
    expect(after.scoped.notes).toEqual([expect.stringMatching(/^wrapper → IRP계좌: .*계좌의 종목을 제외하세요/)])
    // 계좌 종목을 제외하면 그 돈이 빠진다
    const stock = analysisScope(snap(fixture(), plan({ irpStock: { role: 'excluded' } })))
    expect([...stock.dropIds]).toEqual(['irpStock'])
  })

  it('제외 주식은 배당 요약에서 빠지고, 주식 입력이 수동이면 영향 없음을 안내한다', () => {
    const scope = analysisScope(snap(fixture(), plan({ stk: { role: 'investment', linkedTo: 'stk2' } })))
    const out = scopeInputs({ assets: fixture(), dividends: div(), pensionSim: sim() }, scope)
    expect(out.dividends!.items.map(i => i.assetId)).toEqual(['stk2'])
    expect(out.dividends!.totalMonthly).toBe(25_000)
    expect(out.dividends!.totalAnnual).toBe(300_000)
    expect(out.notes.some(n => n.includes('일반 주식 입력이 수동이면'))).toBe(true)
    const linked = scopeInputs({ assets: fixture(), dividends: div(), pensionSim: { ...sim(), stockInputMode: 'assets' } }, scope)
    expect(linked.notes.some(n => n.includes('일반 주식 입력이 수동이면'))).toBe(false)
  })

  it('기준일 뒤 취득(future)은 대상이 아니다 — 기존 분석 처리 유지', () => {
    const assets = fixture().map(a => a.id === 'private' ? { ...a, acquisitionDate: '2027-01-01' } : a)
    expect(analysisScope(snap(assets, plan({ private: { role: 'excluded' } }))).dropIds.size).toBe(0)
  })
})
