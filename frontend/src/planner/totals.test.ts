// 1단계 — 총액 기준 통일: 홈(/)·통합 대시보드(/history)·연금 탭이 같은 snapshotTotals 를 쓰는지 검증
// 국민연금 수급권은 화면 합계에 평가액 포함, 엔진 balance 는 0 유지(지급 일정과 이중 계상 방지)
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/types'
import { blankPlan, buildSnapshot, defaultPolicy, type PlannerPlan } from './model'
import { simulate } from './engine'
import { excludedSummary, formatEok, reviewCounts, snapshotTotals } from './totals'

const asset = (id: string, type: Asset['type'], value: number, extra: Partial<Asset> = {}): Asset => ({
  id, type, name: id, currentValue: value, acquisitionDate: '2020-01-01', acquisitionPrice: value, quantity: 1,
  ownership: { husband: 100, wife: 0 }, createdAt: '', updatedAt: '', history: [], ...extra,
})
const AS_OF = '2026-10-15'
const snap = (assets: Asset[], plan: PlannerPlan = blankPlan(AS_OF)) => buildSnapshot(assets, { currentAge: 40, retirementAge: 60 }, plan, AS_OF + 'T00:00:00Z')
const fixture = () => [
  asset('apt', 'REAL_ESTATE', 1_000_000_000, { detail: { loanAmount: 300_000_000, tenantDeposit: 0 } as any }),
  asset('이창호-국민연금', 'PENSION', 115_000_000, { detail: { pensionType: 'NATIONAL' } as any }),
  asset('배우자-국민연금', 'PENSION', 0, { detail: { pensionType: '국민연금' } as any }),
  asset('IRP', 'PENSION', 39_810_000, { detail: { pensionType: 'IRP' } as any }),
]
const won = (v: number) => v.toLocaleString('ko-KR')

describe('snapshotTotals', () => {
  it('국민연금 수급권은 평가액을 합계·byType 에 포함하고 제외 항목에 넣지 않는다', () => {
    const t = snapshotTotals(snap(fixture()))
    console.log(`[totals] 총자산=${won(t.total)} 부채=${won(t.debt)} 순자산=${won(t.net)} 연금=${won(t.byType.PENSION ?? 0)}`)
    expect(t.total).toBe(1_154_810_000)
    expect(t.debt).toBe(300_000_000)
    expect(t.net).toBe(854_810_000)
    expect(t.byType.PENSION).toBe(154_810_000)
    expect(t.excluded).toEqual([])
    expect(excludedSummary(t.excluded)).toBe('')
  })

  it('엔진 회귀: 수급권 snapshot balance 는 0 유지, 시작 순자산에 평가액이 들어가지 않는다', () => {
    const plan = { ...blankPlan(AS_OF), endDate: '2026-12-31', inflation: 0 }
    const s = snap([
      asset('cash', 'SAVINGS', 1_000_000),
      asset('이창호-국민연금', 'PENSION', 115_000_000, { detail: { pensionType: 'NATIONAL' } as any }),
    ], plan)
    const national = s.positions.find(p => p.assetId === '이창호-국민연금')!
    expect(national.role).toBe('entitlement')
    expect(national.balance).toBe(0)
    expect(snapshotTotals(s).total).toBe(116_000_000)
    const run = simulate(s)
    expect(run.months.length).toBeGreaterThan(0)
    console.log(`[totals] 엔진 첫 달 순자산=${won(run.months[0].netWorth)} (수급권 1.15억 미포함)`)
    expect(run.months[0].netWorth).toBeLessThan(115_000_000)
    expect(run.months.every(m => (m.balances['이창호-국민연금'] ?? 0) === 0)).toBe(true)
  })

  it('저장된 정책: role entitlement 는 포함, role excluded 는 계속 제외', () => {
    const assets = fixture()
    const plan = blankPlan(AS_OF)
    plan.policies = [
      { ...defaultPolicy(assets[1]), role: 'entitlement', confirmed: true },
      { ...defaultPolicy(assets[3]), role: 'excluded', confirmed: true },
    ]
    const t = snapshotTotals(snap(assets, plan))
    console.log(`[totals] 저장 정책 — 총자산=${won(t.total)} 연금=${won(t.byType.PENSION ?? 0)} · ${excludedSummary(t.excluded)}`)
    expect(t.byType.PENSION).toBe(115_000_000)
    expect(t.total).toBe(1_115_000_000)
    expect(t.excluded).toEqual([{ assetId: 'IRP', name: 'IRP', type: 'PENSION', amount: 39_810_000, reason: 'excluded' }])
    expect(excludedSummary(t.excluded)).toBe('제외 항목: IRP 합산 제외 3,981만원')
  })

  it('기준일 뒤 취득 수급권은 future 로 제외', () => {
    const t = snapshotTotals(snap([asset('np', 'PENSION', 50_000_000, { acquisitionDate: '2027-01-01', detail: { pensionType: 'NATIONAL' } as any })]))
    expect(t.total).toBe(0)
    expect(t.excluded.map(e => [e.assetId, e.reason])).toEqual([['np', 'future']])
  })

  it('매각 자산은 합계·제외 목록 모두에 없고, 기준일 뒤 취득 자산은 제외 항목, 미래 매각 예정은 합산', () => {
    const t = snapshotTotals(snap([
      asset('sold', 'STOCK', 5_000_000, { disposalDate: '2025-01-01' }),
      asset('future', 'SAVINGS', 7_000_000, { acquisitionDate: '2027-01-01' }),
      asset('selling', 'SAVINGS', 2_000_000, { disposalDate: '2027-06-30' }),
      asset('cash', 'SAVINGS', 1_000_000),
    ]))
    expect(t.total).toBe(3_000_000)
    expect(t.excluded.map(e => [e.assetId, e.reason])).toEqual([['future', 'future']])
  })

  it('formatEok / 빈 제외 목록', () => {
    expect(formatEok(115_000_000)).toBe('1.15억')
    expect(formatEok(200_000_000)).toBe('2억')
    expect(formatEok(39_810_000)).toBe('3,981만원')
    expect(excludedSummary([])).toBe('')
  })
})

// 2단계 — 홈 검토 건수 분리: 합계 영향 vs 분석 조건 미확인 (미확인 기본 정책은 합계를 바꾸지 않는다)
describe('reviewCounts', () => {
  it('미확인 기본 정책은 "분석 조건 미확인"으로만 센다 (합계 영향 0)', () => {
    expect(reviewCounts(snap(fixture()))).toEqual({ totalImpact: 0, analysis: 4 })
  })
  it('모두 확인하면 0건', () => {
    const assets = fixture()
    const plan = blankPlan(AS_OF)
    plan.policies = assets.map(a => ({ ...defaultPolicy(a), confirmed: true }))
    expect(reviewCounts(snap(assets, plan))).toEqual({ totalImpact: 0, analysis: 0 })
  })
  it('기준일 뒤 취득은 합계 영향 + (미확인이면) 분석 미확인 양쪽에 자산 단위로 센다', () => {
    const r = reviewCounts(snap([asset('f', 'SAVINGS', 1_000_000, { acquisitionDate: '2027-01-01' })]))
    expect(r).toEqual({ totalImpact: 1, analysis: 1 })
  })
  it('미확인 합산 제외(excluded)는 합계 영향으로 센다', () => {
    const assets = fixture()
    const plan = blankPlan(AS_OF)
    plan.policies = [{ ...defaultPolicy(assets[3]), role: 'excluded' }]
    expect(reviewCounts(snap(assets, plan)).totalImpact).toBe(1)
  })
  it('linkedStockId 연결 연금: balance 0 · 제외 사유 linked · 평가액 있으면 합계 영향 경고', () => {
    const stockA = asset('s1', 'STOCK', 250_000_000, { detail: { accountName: '퇴직IRP' } as any })
    const wrapper = asset('퇴직연금', 'PENSION', 300_000_000, { detail: { pensionType: 'IRP', linkedStockId: '퇴직IRP' } as any })
    const s = snap([stockA, wrapper])
    const pos = s.positions.find(p => p.assetId === '퇴직연금')!
    expect(pos.balance).toBe(0)
    expect(pos.linkedAccount).toBe('퇴직IRP')
    const t = snapshotTotals(s)
    expect(t.total).toBe(250_000_000)
    expect(t.excluded).toEqual([expect.objectContaining({ assetId: '퇴직연금', reason: 'linked', amount: 300_000_000 })])
    expect(reviewCounts(s).totalImpact).toBe(1)   // LINKED_BALANCE
    // 래퍼 평가액이 0이면(정상 연결) 합계 영향 경고 없음 (평가액 0인 제외 항목은 목록에 표시하지 않음)
    const s2 = snap([stockA, { ...wrapper, currentValue: 0 }])
    expect(snapshotTotals(s2).excluded).toEqual([])
    expect(reviewCounts(s2).totalImpact).toBe(0)
  })
})
