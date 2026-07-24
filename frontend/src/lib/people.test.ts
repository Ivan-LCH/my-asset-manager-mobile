import { describe, it, expect } from 'vitest'
import { parseBirthYear, resolveAge, resolveRetirementYear, nationalPensionStartYear, hasSpouse } from '@/lib/people'

describe('people (생년월 헬퍼)', () => {
  it('parseBirthYear: YYYY.MM 파싱', () => {
    expect(parseBirthYear('1972.03')).toBe(1972)
    expect(parseBirthYear('')).toBeNull()
    expect(parseBirthYear(undefined)).toBeNull()
  })

  it('nationalPensionStartYear: 출생연도 + 65', () => {
    expect(nationalPensionStartYear('1972.03')).toBe(2037)
    expect(nationalPensionStartYear('')).toBeNull()
  })

  it('resolveAge: 생년월 우선, 없으면 currentAge 폴 백', () => {
    const y = new Date().getFullYear()
    expect(resolveAge({ birthHusband: '1972.03' })).toBe(y - 1972)
    expect(resolveAge({ currentAge: 50 })).toBe(50)  // 생년월 없으면 폴 백
  })

  it('resolveRetirementYear: retirementYear 우선, 없으면 retirementAge 변환', () => {
    expect(resolveRetirementYear({ retirementYear: 2040 })).toBe(2040)
    expect(resolveRetirementYear({ currentAge: 50, retirementAge: 65 })).toBe(new Date().getFullYear() + 15)
  })

  it('hasSpouse: 와이프 생년월 유무 (미혼 판정)', () => {
    expect(hasSpouse({ birthWife: '1975.03' })).toBe(true)
    expect(hasSpouse({ birthWife: '' })).toBe(false)
    expect(hasSpouse({})).toBe(false)
  })
})
