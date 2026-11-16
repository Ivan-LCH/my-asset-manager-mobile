// 허브 상단 「빠진 항목」 — 비어 있는 입력만
import { describe, it, expect } from 'vitest'
import { hubMissing } from './checklist'
import type { PensionSimPlan, RetirementPlan, Settings } from '@/types'

const settings = { birthHusband: '1975.03', birthWife: '1978.07', retirementYear: 2035, wifeRetirementYear: 2038 } as Partial<Settings>
const retirement = { expenses: [], medicalMonthly: 0, lumpsum: [{ id: 'j', name: '전세금', receiveYear: 2030, amount: 5e8 }] } as unknown as Partial<RetirementPlan>
const pension = { allocations: [{ lumpsumId: 'j', irpAmount: 0, stockAmount: 0, destination: 'cash' }], healthHouseholdMode: 'joint' } as unknown as PensionSimPlan

describe('hubMissing', () => {
  it('모두 입력됨 → 빈 목록', () => {
    expect(hubMissing(settings, retirement, pension)).toEqual([])
  })
  it('빈 저장소 → 생년월·은퇴 연도·생활비·의료비 (배우자 없으면 와이프 항목 없음)', () => {
    expect(hubMissing({}, {}, null).map((m) => [m.key, m.section])).toEqual([
      ['birth', 'people'], ['retirementYear', 'people'], ['expenses', 'living'], ['medical', 'living'],
    ])
  })
  it('배우자가 있는데 와이프 은퇴 연도가 없으면 표시, 은퇴 입력 값이 있으면 채워진 것으로 본다', () => {
    const s = { ...settings, wifeRetirementYear: '' } as unknown as Partial<Settings>
    expect(hubMissing(s, retirement, pension).map((m) => m.key)).toEqual(['wifeRetirementYear'])
    expect(hubMissing(s, { ...retirement, wifeRetirementYear: 2040 }, pension)).toEqual([])
  })
  it('행선지(분배)가 없는 목돈과 건보 세대 미확인', () => {
    const r = { ...retirement, lumpsum: [...retirement.lumpsum!, { id: 'k', name: '', receiveYear: 2031, amount: 1e8 }] } as Partial<RetirementPlan>
    const m = hubMissing(settings, r, { ...pension, healthHouseholdMode: undefined })
    expect(m.map((x) => [x.key, x.label, x.section])).toEqual([
      ['lumpsum:k', '목돈 행선지 · 이름 없는 목돈', 'lumpsum'], ['health', '건보 세대 가정', 'tax'],
    ])
  })
})
