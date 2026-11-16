// 허브 상단 「빠진 항목」 — 저장된 입력만 읽어 비어 있는 것만 고른다 (저장·기본값 생성 없음).
import type { PensionSimPlan, RetirementPlan, Settings } from '@/types'
import { retirementInputs } from '@/lib/analysisInputs'
import { hasSpouse, parseBirthYear } from '@/lib/people'
import type { HubSectionId } from './sections'

export interface MissingItem { key: string; label: string; section: HubSectionId }

export function hubMissing(
  settings: Partial<Settings> | undefined,
  retirement: Partial<RetirementPlan> | undefined,
  pension: PensionSimPlan | null | undefined,
): MissingItem[] {
  const s = settings ?? {}, r = retirement ?? {}
  const inputs = retirementInputs(r, s)
  const out: MissingItem[] = []
  if (parseBirthYear(s.birthHusband) === null && !(Number(s.currentAge) > 0)) out.push({ key: 'birth', label: '본인 생년월', section: 'people' })
  if (inputs.missing.some((m) => m.label === '은퇴 예정 연도')) out.push({ key: 'retirementYear', label: '본인 은퇴 연도', section: 'people' })
  if (hasSpouse(s) && inputs.wifeYear == null) out.push({ key: 'wifeRetirementYear', label: '와이프 은퇴 연도', section: 'people' })
  if (!Array.isArray(r.expenses)) out.push({ key: 'expenses', label: '생활비', section: 'living' })
  if (inputs.medicalMissing) out.push({ key: 'medical', label: '의료비', section: 'living' })
  const allocations = pension?.allocations ?? []
  for (const l of r.lumpsum ?? []) {
    if (l.amount > 0 && !allocations.some((a) => a.lumpsumId === l.id))
      out.push({ key: 'lumpsum:' + l.id, label: `목돈 행선지 · ${l.name || '이름 없는 목돈'}`, section: 'lumpsum' })
  }
  if (pension && !pension.healthHouseholdMode) out.push({ key: 'health', label: '건보 세대 가정', section: 'tax' })
  return out
}
