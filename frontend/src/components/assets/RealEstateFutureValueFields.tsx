// 재건축·준공 후 가치 전환 필드 — 신규 등록(AssetCreateForm)·편집(AssetForm) 공유.
// 완공 연도(futureYear)부터 잔액 추이·걸보 재산분·보유세에 예상 가치(futureValue) 반영.

interface Props {
  futureValue: number
  futureYear: number
  onFutureValue: (v: number) => void
  onFutureYear: (v: number) => void
}

export default function RealEstateFutureValueFields({ futureValue, futureYear, onFutureValue, onFutureYear }: Props) {
  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500'
  const labelCls = 'text-xs text-gray-400 mb-1 block'

  return (
    <div className="border-t border-gray-700/50 pt-3 mt-2">
      <p className="text-xs text-gray-500 mb-2">🏗️ 재건축 (입주 시점 가치 전환)</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>입주 후 예상 가치</label>
          <input type="text" inputMode="numeric" className={inputCls} value={futureValue > 0 ? futureValue.toLocaleString() : ''} onChange={(e) => onFutureValue(Number(e.target.value.replace(/,/g, '')) || 0)} placeholder="0 (미입력 시 현재 가치 유지)" />
        </div>
        <div>
          <label className={labelCls}>입주 예정 연도</label>
          <input type="number" inputMode="decimal" className={inputCls} value={futureYear || ''} onChange={(e) => onFutureYear(+e.target.value)} placeholder="예: 2028" />
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-1">해당 연도부터 잔액 추이·걸보 재산분·보유세에 예상 가치 반영.</p>
    </div>
  )
}
