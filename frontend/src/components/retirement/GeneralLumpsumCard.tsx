import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { AmountInput, TextInput, YearInput } from '@/components/sim'
import { formatManwon, cn } from '@/lib/utils'
import type { LumpsumItem, Ownership, PensionAllocation } from '@/types'

// ── 일반 목돈 카드 (퇴직금 외) ─────────────────────────────
// 이름·연도·금액·명의는 은퇴계획 목돈(생활비·목돈 입력과 같은 항목), 행선지·증권 금액·배당 비율은 목돈 분배에 저장.
export type AllocPatch = Partial<Pick<PensionAllocation,'irpAmount'|'stockAmount'|'irpSourceId'|'irpRetirementTaxRate'|'destination'|'stockDividendRatio'>>
type Destination = NonNullable<PensionAllocation['destination']>
const DESTINATIONS: [Destination, string][] = [['cash', '현금'], ['stock', '일반증권계좌'], ['partial', '일부만 증권']]

/** 저장된 힌트가 없으면 stockAmount 로 행선지 추정 (기존 데이터 호환). */
export function destinationOf(lumpsum: LumpsumItem, a: Pick<PensionAllocation,'irpAmount'|'stockAmount'|'destination'>): Destination {
  if (a.destination) return a.destination
  if (a.stockAmount <= 0) return 'cash'
  return a.stockAmount >= Math.max(0, lumpsum.amount - a.irpAmount) ? 'stock' : 'partial'
}

export function GeneralLumpsumCard({ lumpsum, allocation, ownership, onLumpsum, onAllocation, onRemove, children }: {
  lumpsum: LumpsumItem
  allocation: Pick<PensionAllocation,'irpAmount'|'stockAmount'|'destination'|'stockDividendRatio'>
  ownership: Ownership
  onLumpsum: (patch: Partial<LumpsumItem>) => void
  onAllocation: (patch: AllocPatch) => void
  onRemove: () => void
  /** 카드 안 추가 입력 (예: 생활비·목돈 입력 탭의 과세 구분 토글) */
  children?: ReactNode
}) {
  const dest = destinationOf(lumpsum, allocation)
  const irp = Math.max(0, allocation.irpAmount)   // 기존 데이터 호환용 — 일반 목돈은 새로 IRP를 넣지 않음
  const full = Math.max(0, lumpsum.amount - irp)
  const stock = dest === 'cash' ? 0 : dest === 'stock' ? full : Math.min(full, Math.max(0, allocation.stockAmount))
  const cash = Math.max(0, lumpsum.amount - irp - stock)
  const ratio = allocation.stockDividendRatio ?? 100
  const setDest = (d: Destination) => onAllocation({ destination: d, irpAmount: 0,
    stockAmount: d === 'cash' ? 0 : d === 'stock' ? Math.max(0, lumpsum.amount) : Math.min(lumpsum.amount, allocation.stockAmount > 0 ? allocation.stockAmount : Math.round(lumpsum.amount / 2)) })
  const ownerBtn = (value: LumpsumItem['owner'], label: string) => (
    <button key={label} type="button" onClick={() => onLumpsum({ owner: value })}
      className={cn('flex-1 px-1.5 py-0.5 text-xs rounded transition-colors', lumpsum.owner === value ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
      {label}
    </button>
  )
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2" data-general-lumpsum={lumpsum.id}>
      <div className="flex items-center gap-2">
        <TextInput value={lumpsum.name} onChange={(v) => onLumpsum({ name: v })} placeholder="이름 (예: 전세금 반환)" />
        <button type="button" aria-label={(lumpsum.name || '목돈') + ' 삭제'} onClick={onRemove}
          className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">수령 연도</p>
          <YearInput value={lumpsum.receiveYear} onChange={(v) => onLumpsum({ receiveYear: v })} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">금액</p>
          <AmountInput value={lumpsum.amount} onChange={(v) => {
            onLumpsum({ amount: v })
            if (dest === 'stock') onAllocation({ stockAmount: Math.max(0, v - irp) })
            else if (dest === 'partial' && allocation.stockAmount > v) onAllocation({ stockAmount: Math.max(0, v - irp) })
          }} />
        </div>
      </div>
      {children}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">행선지</p>
        <div className="flex gap-1">
          {DESTINATIONS.map(([d, label]) => (
            <button key={d} type="button" onClick={() => setDest(d)}
              className={cn('flex-1 px-1.5 py-0.5 text-xs rounded transition-colors', dest === d ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {dest === 'partial' && (
        <div>
          <p className="text-xs text-gray-500 mb-0.5">→ 일반증권계좌 금액 (나머지는 현금)</p>
          <AmountInput value={allocation.stockAmount} onChange={(v) => onAllocation({ stockAmount: Math.min(full, Math.max(0, v)) })} />
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500 mb-0.5">명의 (증권 몫 귀속)</p>
        <div className="flex gap-1">
          {ownerBtn('husband', '남편')}
          {ownerBtn('wife', '와이프')}
          {ownerBtn(undefined, `기존 지분 (남편 ${ownership.husband}%)`)}
        </div>
      </div>
      {dest !== 'cash' && stock > 0 && (
        <label className="block text-xs text-gray-500">증권 계좌 안 배분 (배당주 / 일반주)
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-gray-500 shrink-0">배당주</span>
            <input aria-label={(lumpsum.name || '목돈') + ' 배당주 비율'} type="number" inputMode="decimal" min={0} max={100} step="any"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
              value={ratio} onChange={(e) => onAllocation({ stockDividendRatio: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
            <span className="text-xs text-gray-500 shrink-0">% (나머지 일반주)</span>
          </div>
          <span className="block mt-1 text-gray-400">배당주 {formatManwon(stock * ratio / 100)} · 일반주 {formatManwon(stock * (100 - ratio) / 100)} — 일반주는 배당 0%, 둘 다 계좌 상승률로 성장</span>
        </label>
      )}
      {irp > 0 && <p className="text-xs text-amber-300">기존 퇴직IRP 분배 {formatManwon(irp)}가 남아 있습니다. 행선지를 다시 고르면 일반 목돈 기준(IRP 없음)으로 정리됩니다.</p>}
      <p className="text-xs text-gray-500">
        {lumpsum.receiveYear}년 · 증권 <span className="text-gray-300 font-semibold">{formatManwon(stock)}</span> · 현금 <span className="text-gray-300 font-semibold">{formatManwon(cash)}</span>
      </p>
    </div>
  )
}
