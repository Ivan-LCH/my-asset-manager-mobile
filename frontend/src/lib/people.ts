// 사람(남편/와이프) 생년월 기반 나이·연금 개시연도 헬퍼.
// 생년월 형식: "YYYY.MM" (예: "1972.03"). 비어있으면 해당 인물 없음(미혼/단독).
import type { Settings } from '@/types'

/** "YYYY.MM" → 출생연도. 파싱 실패 시 null. */
export function parseBirthYear(birthDate?: string): number | null {
  if (!birthDate) return null
  const y = parseInt(String(birthDate).split('.')[0], 10)
  return Number.isFinite(y) && y > 1900 ? y : null
}

/** 현재 나이 = 올해 − 출생연도. birthHusband 없으면 settings.currentAge 폴 백. */
export function resolveAge(settings?: Partial<Settings>): number {
  const by = parseBirthYear(settings?.birthHusband)
  if (by) return Math.max(0, new Date().getFullYear() - by)
  return settings?.currentAge ?? 40
}

/** 은퇴 예정 연도. settings.retirementYear 있으면 그대로, 아니면 retirementAge에서 변환. */
export function resolveRetirementYear(settings?: Partial<Settings>): number {
  if (settings?.retirementYear) return settings.retirementYear
  const currentAge = resolveAge(settings)
  const retirementAge = settings?.retirementAge ?? 65
  return new Date().getFullYear() + Math.max(0, retirementAge - currentAge)
}

/** 국민연금 개시연도 = 출생연도 + 65. 출생연도 없으면 null. */
export function nationalPensionStartYear(birthDate?: string): number | null {
  const by = parseBirthYear(birthDate)
  return by ? by + 65 : null
}

/** 와이프 생년월 존재 여부 (없으면 미혼/단독 가정). */
export function hasSpouse(settings?: Partial<Settings>): boolean {
  return parseBirthYear(settings?.birthWife) !== null
}
