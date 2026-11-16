// 허브 ⑤ 세금·건보 — 연금 시뮬의 과세 입력(건보 세대 가정·기타종합소득·세금 추가정보)과 법인 시뮬 입력(고급)을 옮김.
// 저장 위치는 그대로: PensionSimPlan.healthHouseholdMode/otherIncome/incomeTaxSettings/irpTransfers, CorpSimPlan.
import { useLocation } from 'react-router-dom'
import { AmountInput, Row, MoreInfo } from '@/components/sim'
import { IncomeTaxSettingsEditor } from '@/components/retirement/IncomeTaxSettingsEditor'
import CorpSimPage from '@/pages/CorpSimPage'
import { useRetirement } from '@/hooks/useRetirement'
import type { PensionSimPlan } from '@/types'
import { usePensionDraft, usePensionProjection } from './drafts'
import { SaveBar } from './SaveBar'

export function TaxSection() {
  const corpOpen = useLocation().hash === '#corp-inputs'
  const pension = usePensionDraft()
  const { data: retirement } = useRetirement()
  const { effectivePlan, projection } = usePensionProjection(pension.plan, retirement?.lumpsum ?? [])
  const update = pension.update
  const save = () => void pension.save().catch(() => {})
  if (!pension.ready) return <p role="status" className="text-sm text-gray-400">불러오는 중…</p>
  return (
    <div className="space-y-5" data-tax-editor>
      <div className="space-y-2">
        <label className="block text-xs text-gray-300">건강보험 가입 가정
          <select aria-label="건강보험 가입 가정" value={pension.plan.healthHouseholdMode??''} onChange={e=>update('healthHouseholdMode',(e.target.value||undefined) as PensionSimPlan['healthHouseholdMode'])} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded p-2">
            <option value="">미확인 · 같은 지역가입 세대로 추정</option><option value="joint">부부가 같은 지역가입 세대</option><option value="separate">부부가 각각 별도 지역가입 세대</option>
          </select>
        </label>
        <MoreInfo>직장가입자·피부양자 자격 판단은 지원하지 않습니다. 해당되면 이 지역가입 추정액을 사용하지 마세요.</MoreInfo>
        <Row label="기타 종합소득(연)" hint="남편 근로/사업 소득 등">
          <AmountInput value={pension.plan.otherIncome} onChange={(v) => update('otherIncome', v)} />
        </Row>
        <MoreInfo label="과세 기준">
          <p>국민연금과 종합합산을 선택한 사적연금은 연금소득공제 후 금융·기타소득과 함께 계산합니다. 퇴직금 재원은 분리합니다.</p>
          <p>기존 배우자·표준공제의 절반 배분 및 고정 1,200만원 연금공제는 더 이상 적용하지 않습니다. 이전 공제 설정은 백업에 보존하지만 새 계산에 사용하지 않습니다.</p>
        </MoreInfo>
      </div>
      <IncomeTaxSettingsEditor plan={{...effectivePlan,sources:projection.sources}} onChange={value=>update('incomeTaxSettings',value)} onTransfers={value=>update('irpTransfers',value)} onSave={save} dirty={pension.dirty} saving={pension.saving}/>
      <SaveBar label="세금·건보" dirty={pension.dirty} saving={pension.saving} error={pension.error} onSave={save} />

      <details id="corp-inputs" className="border-t border-gray-700 pt-4" open={corpOpen || undefined} data-corp-inputs>
        <summary className="cursor-pointer text-sm font-semibold text-gray-200">🏛️ 법인 시뮬 입력 (고급)</summary>
        <p className="text-xs text-gray-500 mt-1">법인을 쓰지 않으면 건너뛰어도 돼요. 결과는 분석 › 고급에서 봐요.</p>
        <div className="-mx-4 md:-mx-6"><CorpSimPage mode="inputs" /></div>
      </details>
    </div>
  )
}
