// 사람(남편/와이프) 생년월 기반 나이·연금 개시연도 헬퍼.
// 생년월 형식: "YYYY.MM" (예: "1980.05"). 비어있으면 해당 인물 없음(미혼/단독).
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

/** 연도 입력값 검증 (정수 1900 초과). 빈 문자열·NaN·undefined → null. */
export function validYear(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isInteger(n) && n > 1900 ? n : null
}

/** 와이프 은퇴 예정 연도. 배우자(birthWife)가 없거나 미입력이면 null — 연도를 임의로 만들지 않는다. */
export function resolveWifeRetirementYear(settings?: Partial<Settings>): number | null {
  if (!hasSpouse(settings)) return null
  return validYear(settings?.wifeRetirementYear)
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

/** 해당 연도의 은퇴 표시 라벨 (표시 전용). 남편 은퇴 연도 → '은퇴', 와이프 은퇴 연도 → '와이프 은퇴'. 같은 해면 둘 다. */
export function retirementMarkers(year: number, husbandYear?: number | null, wifeYear?: number | null): string[] {
  const marks: string[] = []
  if (husbandYear != null && year === husbandYear) marks.push('은퇴')
  if (wifeYear != null && year === wifeYear) marks.push('와이프 은퇴')
  return marks
}

/** 연도별 나이 = 연도 − 출생연도. 출생연도 없으면 null. */
export function ageInYear(year: number, birthYear?: number | null): number | null {
  return birthYear ? year - birthYear : null
}

/** 연도 스위처 나이 문구 — 배우자 있으면 '남편 N세 · 와이프 M세', 없으면 '남편 N세 · 미혼(단독)'. */
export function ageSummaryText(husbandAge: number, wifeAge: number | null): string {
  return wifeAge != null ? `남편 ${husbandAge}세 · 와이프 ${wifeAge}세` : `남편 ${husbandAge}세 · 미혼(단독)`
}
