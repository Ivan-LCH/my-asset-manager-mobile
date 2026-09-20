// 재건축·준공 후 가치 전환 필드 — 신규 등록(AssetCreateForm)·편집(AssetForm) 공유.
// 완공 연도(futureYear)부터 잔액 추이·걸보 재산분·보유세에 예상 가치(futureValue) 반영.

interface Props {
  futureValue: number
  futureYear: number
  onFutureValue: (v: number) => void
  onFutureYear: (v: number) => void
  housingTaxStartDate: string
  onHousingTaxStartDate: (v:string)=>void
  constructionHoldingTaxAnnual?: number
  onConstructionHoldingTaxAnnual:(v:number|undefined)=>void
}

export default function RealEstateFutureValueFields({ futureValue, futureYear, onFutureValue, onFutureYear, housingTaxStartDate, onHousingTaxStartDate, constructionHoldingTaxAnnual, onConstructionHoldingTaxAnnual }: Props) {
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
      <p className="text-xs text-gray-400 mt-1">예상 가치는 해당 연도부터 반영합니다. 주택 보유세 전환은 아래 날짜를 별도로 사용합니다.</p>
      {(futureYear>0||housingTaxStartDate)&&<details className="mt-3 text-sm"><summary className="cursor-pointer">재건축 세금 시점 확인 (선택)</summary><div className="space-y-3 mt-3">
        <label className={labelCls}>주택 과세대상 전환일 (확인값 또는 계획 가정)<input aria-label="주택 과세대상 전환일" type="date" className={inputCls} value={housingTaxStartDate} onChange={e=>onHousingTaxStartDate(e.target.value)}/></label>
        <p className="text-xs text-gray-400">해당 연도 6월 1일까지 전환되면 그 해 주택 보유세를 추정합니다. 실제 과세대상 판단을 대신하지 않습니다. 날짜가 없으면 입주 예정 연도 기준 가정임을 표시합니다.</p>
        <label className={labelCls}>전환 전 연 보유세 (토지 등 포함, 원)<input aria-label="공사 중 연 보유세" type="number" min="0" className={inputCls} value={constructionHoldingTaxAnnual??''} onChange={e=>onConstructionHoldingTaxAnnual(e.target.value===''?undefined:Math.max(0,Number(e.target.value)))} placeholder="미입력: 확인 필요 / 실제 0원은 0 입력"/></label>
        <p className="text-xs text-gray-400">공사 중 세금은 자동 면제하지 않습니다. 입력한 연 금액은 주택 전환 전까지만 반영됩니다.</p>
      </div></details>}
    </div>
  )
}
