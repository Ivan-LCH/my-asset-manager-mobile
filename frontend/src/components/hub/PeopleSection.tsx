// 허브 ① 인물·은퇴 — 생년월, 본인·와이프 은퇴 연도의 유일한 편집기 (설정 화면에서 옮김).
// 읽기 우선순위는 그대로(은퇴 입력 > 설정, lib/analysisInputs). 저장은 기존 두 편집기가 쓰던 필드를 그대로 쓴다:
//   설정: birthHusband·birthWife·retirementYear·wifeRetirementYear
//   은퇴 입력(RetirementPlan): 이미 값이 있는 은퇴 연도만 같이 맞춤 → 어느 쪽에서 읽어도 같은 값
import { useEffect, useState } from 'react'
import { useSettings, useSaveSettings } from '@/hooks/useSettings'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { retirementInputs } from '@/lib/analysisInputs'
import { resolveAge, nationalPensionStartYear, hasSpouse, validYear } from '@/lib/people'
import type { RetirementPlan, Settings } from '@/types'
import { SaveBar } from './SaveBar'

/** 화면에 보이는 은퇴 연도 = 분석이 실제로 쓰는 값 */
export function effectiveYears(retirement: Partial<RetirementPlan> | undefined, settings: Partial<Settings> | undefined) {
  const r = retirementInputs(retirement ?? {}, settings ?? {})
  const husband = retirement?.retirementYear ?? settings?.retirementYear
  return { husband: validYear(husband), wife: r.wifeYear }
}

export function PeopleSection() {
  const { data: settings, isPending } = useSettings()
  const { data: retirementSaved, isPending: retirementPending } = useRetirement()
  const saveMut = useSaveSettings()
  const saveRetirementMut = useSaveRetirement()

  const init = () => {
    const years = effectiveYears(retirementSaved, settings)
    return {
      birthHusband: settings?.birthHusband ?? '',
      birthWife: settings?.birthWife ?? '',
      retirementYear: years.husband ?? settings?.retirementYear ?? new Date().getFullYear() + 10,
      wifeRetirementYear: years.wife?.toString() ?? '',
    }
  }
  const [form, setForm] = useState(init)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (!dirty) setForm(init()) }, [settings, retirementSaved]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true) }
  const { birthHusband, birthWife, retirementYear, wifeRetirementYear } = form

  const handleSave = async () => {
    const wifeYear = validYear(wifeRetirementYear)
    // 은퇴 입력에 값이 있으면 같이 맞춰 두 저장 위치가 어긋나지 않게 한다 (기존 설정·현금흐름 저장과 같은 필드)
    const retirementPatch: Partial<RetirementPlan> = {}
    if (retirementSaved?.retirementYear != null) retirementPatch.retirementYear = retirementYear
    if (retirementSaved?.wifeRetirementYear != null) retirementPatch.wifeRetirementYear = wifeYear ?? undefined
    try {
      if (Object.keys(retirementPatch).length) await saveRetirementMut.mutateAsync(retirementPatch)
      await saveMut.mutateAsync({ birthHusband, birthWife, retirementYear, wifeRetirementYear: wifeYear ?? '' } as Partial<Settings>)
      setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch { /* 오류 표시는 SaveBar */ }
  }

  if (isPending || retirementPending) return <p role="status" className="text-sm text-gray-400">불러오는 중…</p>
  const inputCls = 'bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 w-36'
  const preview = { birthHusband, birthWife }
  return (
    <div className="space-y-4" data-people-editor>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="hub-birth-husband">본인(남편) 생년월</label>
          <input id="hub-birth-husband" type="text" inputMode="decimal" placeholder="예: 1980.05" className={inputCls}
            value={birthHusband} onChange={(e) => set({ birthHusband: e.target.value })} />
          <p className="text-xs text-gray-500 mt-1">
            {birthHusband ? `지금 ${resolveAge(preview)}세 · 65세 되는 해 ${nationalPensionStartYear(birthHusband) ?? '-'}년` : '나이 계산에 써요.'}
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="hub-birth-wife">와이프 생년월</label>
          <input id="hub-birth-wife" type="text" inputMode="decimal" placeholder="비우면 미혼" className={inputCls}
            value={birthWife} onChange={(e) => set({ birthWife: e.target.value })} />
          <p className="text-xs text-gray-500 mt-1">
            {hasSpouse(preview) ? `65세 되는 해 ${nationalPensionStartYear(birthWife)}년` : '비워 두면 미혼(단독)으로 계산해요.'}
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="hub-retirement-year">본인 은퇴 연도</label>
          <input id="hub-retirement-year" aria-label="본인 은퇴 연도" type="number" inputMode="decimal" className={inputCls}
            value={retirementYear} onChange={(e) => set({ retirementYear: +e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1" htmlFor="hub-wife-retirement-year">와이프 은퇴 연도</label>
          <input id="hub-wife-retirement-year" aria-label="와이프 은퇴 연도" type="number" inputMode="decimal" placeholder="비우면 미입력"
            className={`${inputCls} disabled:opacity-40`} disabled={!hasSpouse(preview)}
            value={hasSpouse(preview) ? wifeRetirementYear : ''} onChange={(e) => set({ wifeRetirementYear: e.target.value })} />
          <p className="text-xs text-gray-500 mt-1">
            {!hasSpouse(preview) ? '미혼이면 필요 없어요.'
              : validYear(wifeRetirementYear) === null ? '비워 두면 피부양자 경로는 계산하지 않아요.'
                : '본인보다 늦으면 피부양자 경로를 분석에 보여 드려요.'}
          </p>
        </div>
      </div>
      <SaveBar label="인물·은퇴" dirty={dirty} saving={saveMut.isPending || saveRetirementMut.isPending}
        error={saveMut.isError || saveRetirementMut.isError} onSave={() => void handleSave()} />
      {saved && <p className="text-xs text-emerald-400">저장했어요.</p>}
    </div>
  )
}
