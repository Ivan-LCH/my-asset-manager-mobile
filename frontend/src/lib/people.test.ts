import { describe, it, expect } from 'vitest'
import { parseBirthYear, resolveAge, resolveRetirementYear, nationalPensionStartYear, hasSpouse, resolveWifeRetirementYear, validYear } from '@/lib/people'

describe('people (생년월 헬퍼)', () => {
  it('parseBirthYear: YYYY.MM 파싱', () => {
    expect(parseBirthYear('1980.05')).toBe(1980)
    expect(parseBirthYear('')).toBeNull()
    expect(parseBirthYear(undefined)).toBeNull()
  })

  it('nationalPensionStartYear: 출생연도 + 65', () => {
    expect(nationalPensionStartYear('1980.05')).toBe(2045)
    expect(nationalPensionStartYear('')).toBeNull()
  })

  it('resolveAge: 생년월 우선, 없으면 currentAge 폴 백', () => {
    const y = new Date().getFullYear()
    expect(resolveAge({ birthHusband: '1980.05' })).toBe(y - 1980)
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

  it('resolveWifeRetirementYear: 배우자 있고 연도 입력 시만 값, 아니면 null', () => {
    expect(resolveWifeRetirementYear({ birthWife: '1982.03', wifeRetirementYear: 2045 })).toBe(2045)
    expect(resolveWifeRetirementYear({ birthWife: '1982.03' })).toBeNull()
    expect(resolveWifeRetirementYear({ birthWife: '1982.03', wifeRetirementYear: '' as unknown as number })).toBeNull()
    expect(resolveWifeRetirementYear({ birthWife: '', wifeRetirementYear: 2045 })).toBeNull() // 미혼
  })

  it('validYear: 정수 연도만 허용', () => {
    expect(validYear(2040)).toBe(2040)
    expect(validYear('2040')).toBe(2040)
    expect(validYear('')).toBeNull()
    expect(validYear(undefined)).toBeNull()
    expect(validYear(20.5)).toBeNull()
  })
})
