import { describe, it, expect } from 'vitest'
import {
  EMPTY_PENSION_PLAN, pensionIncomeTax, simulatePension, totalPrincipal, sourcesFromAssets,
} from '@/lib/pensionSim'
import type { PensionSimPlan } from '@/types'

const plan = (over: Partial<PensionSimPlan> = {}): PensionSimPlan => ({ ...EMPTY_PENSION_PLAN, ...over })

describe('pensionSim 계산', () => {
  it('pensionIncomeTax: 1,200만 공제 후 누진', () => {
    // 수령 1,200만 → 공제后 0 → 세금 0
    expect(pensionIncomeTax(0)).toBe(0)
    // 수령 2,000만 → 과세 800만 → 3% = 24만
    expect(pensionIncomeTax(8_000_000)).toBeCloseTo(8_000_000 * 0.03)
    // 과세 3,000만 → 3% (3,400만 이하 구간)
    expect(pensionIncomeTax(30_000_000)).toBeCloseTo(30_000_000 * 0.03)
    // 과세 4,000만 → 4% - 34만 (3,400만 초과 구간)
    expect(pensionIncomeTax(40_000_000)).toBeCloseTo(40_000_000 * 0.04 - 340_000)
  })

  it('totalPrincipal: 원천 합산', () => {
    expect(totalPrincipal(plan())).toBe(400_000_000) // 3억 + 1억
  })

  it('simulatePension: 수익률 0이면 매년 잔액 감소', () => {
    // 수익률 0이면 확정 감소. 수익률 > 인출률이면 초기엔 증가 가능 (정상)
    const r = simulatePension(plan({ sources: [{ id: 's', name: 'test', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }] }))
    expect(r.rows).toHaveLength(30)
    expect(r.rows[1].remainingBalance).toBeLessThan(r.rows[0].remainingBalance)
    expect(r.rows[29].remainingBalance).toBeLessThan(r.rows[0].remainingBalance)
  })

  it('simulatePension: IRP + 과세 수령액에 연금소득세, 비과세는 면세', () => {
    const r = simulatePension(plan())
    const r0 = r.rows[0]
    expect(r0.irpWithdraw).toBeGreaterThan(0)    // IRP 수령 있음
    expect(r0.exemptWithdraw).toBeGreaterThan(0) // 비과세 수령 있음
    expect(r0.pensionTax).toBeGreaterThanOrEqual(0) // 세금 (공제后 0 가능)
    // 비과세는 세금 계산에 포함 안 됨 → 총수령 > IRP+과세
    expect(r0.totalWithdraw).toBeGreaterThan(r0.irpWithdraw + r0.taxableWithdraw)
  })

  it('simulatePension: 수익률 0이면 원금/기간 = 연 수령액', () => {
    const p = plan({
      sources: [{ id: 'test', name: 'test', principal: 300_000_000, taxType: 'irp', yieldRate: 0 }],
      withdrawalYears: 30,
    })
    const r = simulatePension(p)
    const expectedAnnual = 300_000_000 / 30
    expect(r.rows[0].irpWithdraw).toBeCloseTo(expectedAnnual, -3)
    // 수익률 0이면 마지막 해 잔액도 0에 가까움
    expect(r.rows[29].remainingBalance).toBeLessThan(1_000)
  })

  it('sourcesFromAssets: PENSION 자산에서 과세 구분 추정', () => {
    const assets = [
      { id: 'a1', name: '퇴직연금', currentValue: 3_0000_0000, detail: { pensionType: '퇴직연금' } },
      { id: 'a2', name: '연금저축', currentValue: 1_0000_0000, detail: { pensionType: '개인연금' } },
    ]
    const sources = sourcesFromAssets(assets, [])
    expect(sources[0].taxType).toBe('irp')        // 퇴직연금 → irp
    expect(sources[1].taxType).toBe('taxable')      // 개인연금 → 과세
    expect(sources[0].principal).toBe(3_0000_0000)
  })
})
