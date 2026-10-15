// 1단계 — 총액 기준 통일: 홈(/)·통합 대시보드(/history)·연금 탭이 같은 snapshotTotals 를 쓰는지 검증
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/types'
import { blankPlan, buildSnapshot } from './model'
import { excludedSummary, formatEok, snapshotTotals } from './totals'

const asset = (id: string, type: Asset['type'], value: number, extra: Partial<Asset> = {}): Asset => ({
  id, type, name: id, currentValue: value, acquisitionDate: '2020-01-01', acquisitionPrice: value, quantity: 1,
  ownership: { husband: 100, wife: 0 }, createdAt: '', updatedAt: '', history: [], ...extra,
})
const AS_OF = '2026-10-15'
const snap = (assets: Asset[]) => buildSnapshot(assets, { currentAge: 40, retirementAge: 60 }, blankPlan(AS_OF), AS_OF + 'T00:00:00Z')

describe('snapshotTotals', () => {
  it('국민연금 수급권은 합계에서 빼고 제외 항목으로 돌려준다 (0원 수급권은 생략)', () => {
    const t = snapshotTotals(snap([
      asset('apt', 'REAL_ESTATE', 1_000_000_000, { detail: { loanAmount: 300_000_000, tenantDeposit: 0 } as any }),
      asset('이창호-국민연금', 'PENSION', 115_000_000, { detail: { pensionType: 'NATIONAL' } as any }),
      asset('배우자-국민연금', 'PENSION', 0, { detail: { pensionType: '국민연금' } as any }),
      asset('IRP', 'PENSION', 39_810_000, { detail: { pensionType: 'IRP' } as any }),
    ]))
    expect(t.total).toBe(1_039_810_000)
    expect(t.debt).toBe(300_000_000)
    expect(t.net).toBe(739_810_000)
    expect(t.byType.PENSION).toBe(39_810_000)
    expect(t.excluded).toEqual([{ assetId: '이창호-국민연금', name: '이창호-국민연금', type: 'PENSION', amount: 115_000_000, reason: 'entitlement' }])
    expect(excludedSummary(t.excluded)).toBe('제외 항목: 이창호-국민연금 수급권 1.15억')
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
