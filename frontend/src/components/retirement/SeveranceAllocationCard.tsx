// 퇴직금(severance) 목돈 분배 카드 — 연금 시뮬레이션 화면에서 그대로 옮김 (허브 ③ 목돈·행선지).
// 퇴직IRP는 퇴직금일 때만 적용. 일반계좌는 항상. 나머지는 자동으로 현금보유.
import { AmountInput, MoreInfo } from '@/components/sim'
import { formatManwon } from '@/lib/utils'
import type { PensionAllocation, PensionSource } from '@/types'

export function SeveranceAllocationCard({ lumpsum, allocation, sources, onChange }: {
  lumpsum: { id: string; name: string; amount: number; receiveYear: number; taxKind?: string }
  allocation: Pick<PensionAllocation,'irpAmount'|'stockAmount'|'irpSourceId'|'irpRetirementTaxRate'>
  sources: PensionSource[]
  onChange: (patch: Partial<Pick<PensionAllocation,'irpAmount'|'stockAmount'|'irpSourceId'|'irpRetirementTaxRate'>>) => void
}) {
  const isSeverance = lumpsum.taxKind === 'severance'
  const irp = isSeverance ? allocation.irpAmount : 0   // 퇴직금 아니면 IRP 경로 없음
  const cash = Math.max(0, lumpsum.amount - irp - allocation.stockAmount)
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-200 font-medium truncate">{lumpsum.name || '목돈'}</span>
        <span className="text-sm text-gray-100 font-semibold shrink-0">{formatManwon(lumpsum.amount)}</span>
      </div>
      <p className="text-xs text-gray-600">{lumpsum.receiveYear}년 일회 수령{lumpsum.taxKind === 'severance' ? ' · 퇴직소득세 적용(현금분)' : ''}</p>
      <div className={isSeverance ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
        {isSeverance && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">→ 퇴직IRP (연금으로 굴림)</p>
            <AmountInput value={allocation.irpAmount} onChange={(v) => onChange({ irpAmount: v })} />
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">→ 일반주식계좌 (배당)</p>
          <AmountInput value={allocation.stockAmount} onChange={(v) => onChange({ stockAmount: v })} />
        </div>
      </div>
      {allocation.irpAmount>0&&<div className="space-y-2">
        <label className="block text-xs text-gray-300">합산할 퇴직IRP
          <select aria-label={lumpsum.name+' 합산할 퇴직IRP'} value={allocation.irpSourceId??''} onChange={e=>onChange({irpSourceId:e.target.value||undefined})} className="mt-1 w-full min-w-0 bg-gray-800 border border-gray-600 rounded p-2 text-sm">
            <option value="">{sources.length===1?'자동 연결: '+sources[0].name:'연결할 IRP를 선택하세요'}</option>
            {allocation.irpSourceId&&!sources.some(s=>s.id===allocation.irpSourceId)&&<option value={allocation.irpSourceId}>기존 연결을 찾을 수 없음 · 다시 선택</option>}
            {sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <MoreInfo>입금 연도에 해당 계좌 잔액에 합산합니다. 등록 월수령액은 입금 전후 잔액 비율로 재산정하며, 별도의 목돈 연금을 더하지 않습니다.</MoreInfo>
        {isSeverance&&<label className="block text-xs text-gray-300">이 퇴직금의 이연퇴직소득세율 (국세 %)<input aria-label={lumpsum.name+' 이연퇴직소득세율 (국세 %)'} className="mt-1 w-full min-w-0 bg-gray-800 border border-gray-600 rounded p-2 text-sm" type="number" min="0" max="100" step="any" placeholder="미확인 · 기존 계좌 세율과 별도" value={allocation.irpRetirementTaxRate??''} onChange={e=>onChange({irpRetirementTaxRate:e.target.value===''?undefined:Math.min(100,Math.max(0,Number(e.target.value)))})}/></label>}
        {isSeverance&&<MoreInfo label="세율 입력 안내">퇴직금 재원은 자동 연결합니다. 세율은 이 목돈의 이연퇴직소득세(국세) ÷ 이연퇴직소득 × 100이며, 모르면 비워두세요.</MoreInfo>}
        {!allocation.irpSourceId&&sources.length!==1&&<p className="text-xs text-amber-300">연결 전에는 추가 연금이 미산정입니다. 현재 자산·기존 월수령액은 바뀌지 않습니다.</p>}
      </div>}
      <p className="text-xs text-gray-500">
        나머지(현금보유) <span className="text-gray-300 font-semibold">{formatManwon(cash)}</span>
        {cash > 0 && <span className="text-gray-600"> → 은퇴계획 목돈 수입</span>}
      </p>
    </div>
  )
}
