import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { AmountInput, TextInput, YearInput, Section, MoreInfo } from '@/components/sim'
import { GeneralLumpsumCard, type AllocPatch } from '@/components/retirement/GeneralLumpsumCard'
import { formatManwon } from '@/lib/utils'
import { uid } from '@/lib/retirementPlan'
import type { LumpsumItem, Ownership, PensionAllocation } from '@/types'

// ── 목돈 수입 섹션 (입력/설정 › ③ 목돈·행선지) ─────────────────
// 목돈의 유일한 편집기. 일반 목돈은 행선지·명의·배당주/일반주 카드, 퇴직금은 renderSeverance 로 IRP 분배 카드를 붙인다.
// 행선지·비율·IRP 분배는 PensionSimPlan.allocations 에 저장한다.
const TAX_KINDS = [['other', '일반(비과세)'], ['severance', '퇴직소득세 적용']] as const

function TaxKindToggle({ item, onChange }: { item: LumpsumItem; onChange: (v: 'other' | 'severance') => void }) {
  return (
    <div className="flex gap-1">
      {TAX_KINDS.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 px-1.5 py-0.5 text-xs rounded transition-colors ${(item.taxKind ?? 'other') === v ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function LumpsumSection({ items, allocations, ownership, onChange, onAllocation, renderSeverance }: {
  items: LumpsumItem[]
  allocations: PensionAllocation[]
  ownership: Ownership
  onChange: (items: LumpsumItem[]) => void
  onAllocation: (lumpsumId: string, patch: AllocPatch) => void
  /** 퇴직금 카드 아래에 붙일 분배 입력 (퇴직IRP·일반주식계좌) */
  renderSeverance?: (item: LumpsumItem) => ReactNode
}) {
  const patch = (id: string, p: Partial<LumpsumItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id))
  return (
    <Section>
      <p className="text-xs font-semibold text-gray-400">💎 목돈 수입 (전세금·퇴직금 등)</p>
      <MoreInfo label="목돈 행선지 안내">
        들어온 목돈을 어디에 넣을지 정하고, 일반증권계좌로 넣으면 계좌 안에서 배당주/일반주 비율을 정합니다.
        일반주 몫은 배당 0%로 보고 계좌 상승률로만 성장합니다. 퇴직금은 퇴직IRP·일반주식계좌로 나누고, 남은 금액은 현금보유가 됩니다.
        저장하면 분석·연금 시뮬레이션에 반영됩니다.
      </MoreInfo>
      <div className="space-y-2">
        {items.map((item) => item.taxKind === 'severance' ? (
          <div key={item.id} className="bg-gray-750 rounded-lg border border-gray-700 p-3 space-y-2" data-severance-lumpsum={item.id}>
            <div className="flex items-center gap-2">
              <TextInput value={item.name} onChange={(v) => patch(item.id, { name: v })} placeholder="항목명 (예: 희망퇴직금)" />
              <button type="button" aria-label={(item.name || '목돈') + ' 삭제'} onClick={() => remove(item.id)} className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">수령 연도</p>
                <YearInput value={item.receiveYear} onChange={(v) => patch(item.id, { receiveYear: v })} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">금액</p>
                <AmountInput value={item.amount} onChange={(v) => patch(item.id, { amount: v })} />
              </div>
            </div>
            <TaxKindToggle item={item} onChange={(v) => patch(item.id, { taxKind: v })} />
            <p className="text-xs text-gray-600">{item.receiveYear}년에 {formatManwon(item.amount)} 일회 수령</p>
            {renderSeverance ? renderSeverance(item) : <p className="text-xs text-gray-500">퇴직금의 IRP·주식 분배는 아래 퇴직금 분배에서 정합니다.</p>}
          </div>
        ) : (
          <GeneralLumpsumCard key={item.id} lumpsum={item}
            allocation={allocations.find((a) => a.lumpsumId === item.id) ?? { irpAmount: 0, stockAmount: 0 }}
            ownership={ownership}
            onLumpsum={(p) => patch(item.id, p)} onAllocation={(p) => onAllocation(item.id, p)} onRemove={() => remove(item.id)}>
            <TaxKindToggle item={item} onChange={(v) => patch(item.id, { taxKind: v })} />
          </GeneralLumpsumCard>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, { id: uid(), name: '', receiveYear: 2030, amount: 0 }])} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus className="w-3 h-3" /> 추가</button>
    </Section>
  )
}
