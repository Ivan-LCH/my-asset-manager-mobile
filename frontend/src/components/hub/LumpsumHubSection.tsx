// 허브 ③ 목돈·행선지 — 목돈의 유일한 편집기 (기존 생활비·목돈 입력 + 연금 시뮬의 목돈 분배를 합침).
// 저장 위치는 그대로: 목돈·긴급자금 → RetirementPlan.lumpsum/emergency, 행선지·배당주 비율·퇴직IRP → PensionSimPlan.allocations.
import { LumpsumSection } from '@/components/retirement/LumpsumSection'
import { EmergencySection } from '@/components/retirement/PrepEditors'
import { SeveranceAllocationCard } from '@/components/retirement/SeveranceAllocationCard'
import type { AllocPatch } from '@/components/retirement/GeneralLumpsumCard'
import { irpTargetSources } from '@/lib/annualPension'
import { formatManwon } from '@/lib/utils'
import type { LumpsumItem } from '@/types'
import { usePensionDraft, useRetirementDraft } from './drafts'
import { SaveBar } from './SaveBar'

export function LumpsumHubSection() {
  const retirement = useRetirementDraft()
  const pension = usePensionDraft()
  const { plan } = retirement
  const allocations = pension.plan.allocations

  // lumpsumId 단위 upsert (기존 연금 시뮬레이션·생활비 입력과 같은 방식)
  const setAllocation = (lumpsumId: string, patch: AllocPatch) => {
    pension.modify('allocations', (list) => list.some((a) => a.lumpsumId === lumpsumId)
      ? list.map((a) => a.lumpsumId === lumpsumId ? { ...a, ...patch } : a)
      : [...list, { lumpsumId, irpAmount: 0, stockAmount: 0, ...patch }])
  }
  // 목돈 삭제 시 해당 분배도 함께 정리
  const updateLumpsum = (items: LumpsumItem[]) => {
    if (allocations.some((a) => plan.lumpsum.some((l) => l.id === a.lumpsumId) && !items.some((l) => l.id === a.lumpsumId)))
      pension.modify('allocations', (list) => list.filter((a) => !plan.lumpsum.some((l) => l.id === a.lumpsumId) || items.some((l) => l.id === a.lumpsumId)))
    retirement.update('lumpsum', items)
  }
  const handleSave = async () => {
    // 목돈 본문 먼저(은퇴계획), 그다음 분배(연금 시뮬) — 기존 연금 시뮬 저장 순서와 같음
    try { await retirement.save(); await pension.save() } catch { /* 오류 표시는 SaveBar */ }
  }

  if (!retirement.ready || !pension.ready) return <p role="status" className="text-sm text-gray-400">불러오는 중…</p>
  const irpInflow = allocations.reduce((s, a) => s + a.irpAmount, 0)
  const stockInflow = allocations.reduce((s, a) => s + a.stockAmount, 0)
  const sources = irpTargetSources(pension.plan, pension.assets)
  return (
    <div className="space-y-5" data-lumpsum-editor>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LumpsumSection items={plan.lumpsum} allocations={allocations} ownership={pension.plan.stockOwnership}
          onChange={updateLumpsum} onAllocation={setAllocation}
          renderSeverance={(item) => (
            <SeveranceAllocationCard lumpsum={item} sources={sources}
              allocation={allocations.find((a) => a.lumpsumId === item.id) ?? { irpAmount: 0, stockAmount: 0 }}
              onChange={(patch) => setAllocation(item.id, patch)} />
          )} />
        <EmergencySection items={plan.emergency} onChange={(v) => retirement.update('emergency', v)} />
      </div>
      <p className="text-xs text-gray-500">투자로 보내는 돈 — 퇴직IRP {formatManwon(irpInflow)} · 일반주식계좌 {formatManwon(stockInflow)}</p>
      <SaveBar label="목돈·행선지" dirty={retirement.dirty || pension.dirty} saving={retirement.saving || pension.saving}
        error={retirement.error || pension.error} onSave={() => void handleSave()} />
    </div>
  )
}
