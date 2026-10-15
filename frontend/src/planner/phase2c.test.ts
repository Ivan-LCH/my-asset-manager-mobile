// 2단계c — 시장가 충격 대상(주식·ETF, IRP 포함)과 "0 = 미입력" 규칙 단위 테스트
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { Asset, PensionSource } from '@/types'
import { db, createAsset, getAllAssets, updateAsset } from '@/lib/db'
import { payoutLabel, payoutMissing } from '@/lib/assetLabels'
import { pensionSchedule, sourcesFromAssets, EMPTY_PENSION_PLAN } from '@/lib/pensionSim'
import { assetPensionAmount, blankPlan, buildSnapshot, type PlannerPlan } from './model'
import { simulate, baseScenario } from './engine'
import { assetFlowPreview } from './storage'

const base = { quantity: 1, acquisitionDate: '2020-01-01', acquisitionPrice: 100, createdAt: '', updatedAt: '', ownership: { husband: 100, wife: 0 }, history: [] }
const stock = (id: string, account: string, value: number, extra: object = {}) =>
  ({ ...base, id, type: 'STOCK', name: id, currentValue: value, detail: { accountName: account, currency: 'KRW', isPensionLike: false, ...extra } } as Asset)
const pension = (id: string, value: number, detail: object) =>
  ({ ...base, id, type: 'PENSION', name: id, currentValue: value, detail: { expectedStartYear: 2030, expectedEndYear: 2050, annualGrowthRate: 0, ...detail } } as unknown as Asset)
const other = (id: string, type: Asset['type'], value: number, detail?: object) => ({ ...base, id, type, name: id, currentValue: value, detail } as Asset)
const settings = { currentAge: 40, retirementAge: 60 }
const plan = (extra: Partial<PlannerPlan> = {}): PlannerPlan => ({ ...blankPlan('2026-01-01'), endDate: '2026-12-31', ...extra })

describe('시장가 충격 — 주식·ETF(IRP 포함)만', () => {
  it('일반·IRP 주식은 충격, 연금 계약·국민연금·연결 래퍼·금·부동산·예적금·현금 지정 주식은 제외', () => {
    const assets = [
      stock('s', '일반', 1_000), stock('irp', '퇴직IRP', 2_000),
      stock('mmf', '일반', 4_000),
      pension('contract', 8_000, { pensionType: '개인연금', expectedMonthlyPayout: 100 }),
      pension('nps', 16_000, { pensionType: '국민연금', expectedMonthlyPayout: 100 }),
      pension('wrap', 32_000, { pensionType: '퇴직연금', linkedStockId: '퇴직IRP', expectedMonthlyPayout: 0 }),
      other('gold', 'PHYSICAL', 64_000), other('house', 'REAL_ESTATE', 128_000, { loanAmount: 0, tenantDeposit: 0 }), other('sav', 'SAVINGS', 256_000, { isPensionLike: false }),
    ]
    const p = plan({ policies: [{ assetId: 'mmf', role: 'cash' } as any] })
    const snap = buildSnapshot(assets, settings, p, '2026-01-01T00:00:00Z')
    expect(snap.positions.find(x => x.assetId === 'irp')!.role).toBe('pension')
    const shocked = simulate(snap, { ...baseScenario, id: 'x', marketShock: -10 })
    const baseRun = simulate(snap)
    // s(1,000)+irp(2,000) 의 10% 만 감소
    expect(baseRun.months[0].netWorth - shocked.months[0].netWorth).toBe(300)
  })
})

describe('0 = 미입력 — 월 수령액', () => {
  it('assetPensionAmount: 0·음수·미입력은 null, 양수만 금액', () => {
    expect(assetPensionAmount(pension('a', 0, { expectedMonthlyPayout: 0 }))).toBeNull()
    expect(assetPensionAmount(pension('a', 0, { expectedMonthlyPayout: -5 }))).toBeNull()
    expect(assetPensionAmount(pension('a', 0, {}))).toBeNull()
    expect(assetPensionAmount(pension('a', 0, { expectedMonthlyPayout: 1_000 }))).toBe(1_000)
    expect(assetPensionAmount(stock('t', 'IRP', 1, { isPensionLike: true, pensionMonthly: 0 }))).toBeNull()
  })

  it('assetFlowPreview: 연결 래퍼 미입력은 건너뛰고, 그 외 미입력은 amount:null 로 만들어 FLOW_AMOUNT 경고', () => {
    const assets = [
      stock('a', '퇴직IRP', 100), stock('t', '개인IRP', 100, { isPensionLike: true, pensionMonthly: 0 }),
      pension('wrap', 0, { pensionType: '퇴직연금', linkedStockId: '퇴직IRP', expectedMonthlyPayout: 0 }),
      pension('ok', 1_000, { pensionType: '개인연금', expectedMonthlyPayout: 500 }),
      pension('zero', 1_000, { pensionType: '개인연금', expectedMonthlyPayout: 0 }),
    ]
    const p = plan({ endDate: '2056-12-31' })
    const snap = buildSnapshot(assets, settings, p, '2026-01-01T00:00:00Z')
    const { plan: next } = assetFlowPreview(p, snap)
    const byAsset = Object.fromEntries(next.flows.map(f => [f.assetId, f.amount]))
    expect(byAsset).toEqual({ t: null, ok: 500, zero: null })
    // 엔진은 기간을 먼저 확인하므로(FLOW_DATE) 시작일을 확정한 뒤 금액 경고를 본다
    const dated = { ...next, flows: next.flows.map(f => ({ ...f, start: { value: '2030-01-31', precision: 'day' as const, offsetMonths: 0 }, end: null })) }
    const run = simulate({ ...snap, plan: dated })
    const amountIssues = run.issues.filter(i => i.code === 'FLOW_AMOUNT').map(i => i.sourceId)
    expect(amountIssues).toEqual(expect.arrayContaining(['asset-payout:t', 'asset-payout:zero']))
  })

  it('엔진 assetPension 재계산: 원본 월액이 0이면 null → 지급 없이 경고', () => {
    const assets = [pension('zero', 0, { pensionType: '국민연금', expectedMonthlyPayout: 0 })]
    const flow = { id: 'f', name: '국민연금', kind: 'pension', amount: 999, amountSource: 'assetPension', assetId: 'zero', ownerId: 'self', targetId: '', start: { value: '2026-01-01', precision: 'day', offsetMonths: 0 }, end: null, frequency: 'monthly', paymentDay: 31, growth: 0, withholding: null, required: true, endsAtRetirement: false, scope: '', basis: '', confirmed: true } as any
    const p = plan({ flows: [flow] })
    const run = simulate(buildSnapshot(assets, settings, p, '2026-01-01T00:00:00Z'))
    expect(run.issues.some(i => i.code === 'FLOW_AMOUNT' && i.sourceId === 'f')).toBe(true)
    expect(run.months.every(m => m.netWorth === run.months[0].netWorth)).toBe(true)
  })

  it('sourcesFromAssets: 자산 월액 0은 저장된 값을 덮어쓰지 않음', () => {
    const saved = [{ id: 'p', name: 'p', principal: 0, taxType: 'taxable', yieldRate: 4, owner: 'husband', expectedMonthlyPayout: 300 } as PensionSource]
    const [s0] = sourcesFromAssets([{ id: 'p', name: 'p', currentValue: 0, detail: { pensionType: '개인연금', expectedMonthlyPayout: 0 } }], saved)
    expect(s0.expectedMonthlyPayout).toBe(300)
    const [s1] = sourcesFromAssets([{ id: 'p', name: 'p', currentValue: 0, detail: { pensionType: '개인연금', expectedMonthlyPayout: 700 } }], saved)
    expect(s1.expectedMonthlyPayout).toBe(700)
  })

  it('pensionSchedule: 국민연금 월액 0 → 지급 0 + nationalMissing 표시', () => {
    const p = { ...EMPTY_PENSION_PLAN, startYear: 2030, withdrawalYears: 3 }
    const rows = pensionSchedule(p, [{ expectedStartYear: 2031, expectedEndYear: 2060, expectedMonthlyPayout: 0, annualGrowthRate: 0 }], 2030, 2032)
    expect(rows.map(r => [r.year, r.nationalAnnual, !!r.nationalMissing])).toEqual([[2030, 0, false], [2031, 0, true], [2032, 0, true]])
    const ok = pensionSchedule(p, [{ expectedStartYear: 2031, expectedEndYear: 2060, expectedMonthlyPayout: 100, annualGrowthRate: 0 }], 2030, 2032)
    expect(ok.map(r => r.nationalAnnual)).toEqual([0, 1_200, 1_200])
    expect(ok.some(r => r.nationalMissing)).toBe(false)
  })

  it('연금 카드 표시: 연결 래퍼 "계좌 인출 (월액 미입력)", 그 외 "미입력", 입력값은 포맷', () => {
    const fmt = (n: number) => `${n}원`
    expect(payoutMissing(0)).toBe(true)
    expect(payoutMissing(undefined)).toBe(true)
    expect(payoutMissing(1)).toBe(false)
    expect(payoutLabel(0, true, fmt)).toBe('계좌 인출 (월액 미입력)')
    expect(payoutLabel(0, false, fmt)).toBe('미입력')
    expect(payoutLabel(undefined, false, fmt)).toBe('미입력')
    expect(payoutLabel(500, true, fmt)).toBe('500원')
  })
})

describe('0 = 미입력 — 매각가 저장 (사용자 저장 시에만)', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('매각일과 함께 빈칸 저장 → 매각가를 비움, 다른 수정은 기존 매각가 유지', async () => {
    const id = await createAsset({ type: 'SAVINGS', name: '적금', currentValue: 1_000, acquisitionDate: '2020-01-01', acquisitionPrice: 1_000, disposalDate: '2026-04-01', disposalPrice: 5_000, detail: { isPensionLike: false } } as any)
    const get = async () => (await getAllAssets()).find(a => a.id === id)!
    await updateAsset(id, { acquisitionPrice: 900 })
    expect((await get()).disposalPrice).toBe(5_000)
    await updateAsset(id, { disposalDate: '2026-04-01', disposalPrice: undefined })
    expect((await get()).disposalPrice).toBeUndefined()
    await updateAsset(id, { disposalDate: '2026-04-01', disposalPrice: 7_000 })
    expect((await get()).disposalPrice).toBe(7_000)
  })
})
