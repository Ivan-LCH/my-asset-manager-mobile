// 일반주식계좌(남편/와이프) 가정 편집기 — 연금 시뮬레이션 화면에서 그대로 옮김 (허브 ④ 연금·주식 가정).
// 저장: PensionSimPlan.stockInputMode / stockOwnership / stockAccount.* (호출부의 섹션 저장 버튼)
import { AmountInput, NumInput, Row, MoreInfo } from '@/components/sim'
import { OwnershipPreset } from '@/components/retirement/OwnershipPreset'
import { stockAccountBalances, stockBalanceFromInflows } from '@/lib/pensionSim'
import type { annualPension } from '@/lib/annualPension'
import { formatManwon, cn } from '@/lib/utils'
import type { LumpsumItem, PensionSimPlan, StockAccountConfig } from '@/types'

export function StockAccountEditor({ plan, lumpsums, update, projection, linkPending, linkError }: {
  plan: PensionSimPlan
  lumpsums: LumpsumItem[]
  update: <K extends keyof PensionSimPlan>(key: K, val: PensionSimPlan[K]) => void
  projection: ReturnType<typeof annualPension>
  linkPending: boolean
  linkError: boolean
}) {
  const updateStockAccount = (who: 'husband' | 'wife', patch: Partial<StockAccountConfig>) =>
    update('stockAccount', { ...plan.stockAccount, [who]: { ...plan.stockAccount[who], ...patch } })
  const stockBalance = stockBalanceFromInflows(plan.allocations)
  const sb = stockAccountBalances(plan, lumpsums)
  return (
    <div className="space-y-3" data-stock-account-editor>
        <label className="block text-xs text-gray-300 mb-3">투자금 입력 기준
          <select aria-label="일반주식 입력 기준" value={plan.stockInputMode??'manual'} onChange={e=>update('stockInputMode',e.target.value as PensionSimPlan['stockInputMode'])} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded p-2">
            <option value="manual">기존 수동 투자금·배당률</option><option value="assets">현재 일반주식 잔액·배당 연결</option>
          </select>
        </label>
        {plan.stockInputMode==='assets'&&<div className="text-xs text-blue-200 mb-3 space-y-2" data-linked-stock-inputs>
          <MoreInfo label="연결 방식"><p>현재 보유한 일반주식의 평가액·명의·배당 예상액을 연결합니다. IRP 연결 계좌·연금성 계좌·처분 자산은 제외합니다. 수동 추가 금액은 보존하되 중복 합산하지 않습니다.</p>
          <p>시세·배당 설정 변경은 자산 화면에서 합니다. 현재 배당은 입력 정보 기반 예상치이며 확정 입금액이 아닙니다. 미래 목돈의 배당률·성장률은 아래 설정을 사용합니다.</p></MoreInfo>
          {linkPending?<p role="status">계좌·배당 정보를 불러오는 중…</p>:linkError?<p role="alert">계좌·배당 조회 실패: 연결 결과를 확정하지 마세요.</p>:<p>연결 계좌 {projection.stockInputs?.accounts.length??0}개 · 현재 잔액 {formatManwon((projection.stockInputs?.husband.balance??0)+(projection.stockInputs?.wife.balance??0))}</p>}
          <details><summary className="cursor-pointer">연결 계좌 근거</summary>{projection.stockInputs?.accounts.map(a=><p key={a.id} className="mt-1 break-words">{a.name}: 잔액 {formatManwon(a.balance)} · 연배당 {formatManwon(a.annualDividend)}</p>)}</details>
        </div>}
        {plan.stockInputMode!=='assets'&&<MoreInfo label="계좌 잔액·배당 계산 방식">
          <p>
            잔액 = <b>목돈 분배(stock) 합계 × 명의지분</b> + <b>추가 금액</b>. 종목 입력 없이
            <b> 계좌 단위 배당률·상승률</b>만 입력 → 연배당·연도별 성장 자동 산정.
            <b> 성장배당 비율</b> = 2026 세제개편 선택분리과세 적용 배당 비중 (0% = 기존 종합과세).
          </p>
          <p>목돈 분배금 변경: ③ 목돈·행선지. 현재 stock 분배 합계 {formatManwon(stockBalance)}.</p>
        </MoreInfo>}
        {/* 명의 — 연결금액(목돈 분배) 분할 비율 */}
        <div className="space-y-2 text-xs text-gray-400 my-3">
          <p>미래 목돈의 주식 배분 (남편/아내) · 현재 계좌 명의와 별개</p>
          <OwnershipPreset value={plan.stockOwnership} onChange={(o) => update('stockOwnership', o)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([['husband', '🧑 남편 계좌', 'text-blue-400'], ['wife', '👩 와이프 계좌', 'text-pink-400']] as const).map(([who, title, color]) => {
            const cfg = plan.stockAccount[who]
            const b = sb[who]
            return (
              <div key={who} className="bg-gray-900/50 rounded-xl border border-gray-700 p-3 space-y-2">
                <p className={cn('text-xs font-bold', color)}>{title}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">연결금액 (분배 지분)</span>
                    <span className="text-gray-300">{formatManwon(b.linked)}</span>
                  </div>
                  {plan.stockInputMode==='assets'?<p className="text-xs text-blue-200">현재 연결 잔액 {formatManwon(projection.stockInputs?.[who].balance??0)} · 수동 추가 금액 {formatManwon(cfg.extraAmount)}은 미반영</p>:<Row label="추가 금액">
                    <AmountInput value={cfg.extraAmount} onChange={(v) => updateStockAccount(who, { extraAmount: v })} placeholder="추가 금액" />
                  </Row>}
                  <Row label={plan.stockInputMode==='assets'?'미래 목돈 배당률':'배당률'}>
                    <NumInput value={cfg.dividendYield} onChange={(v) => updateStockAccount(who, { dividendYield: v })} suffix="%" />
                  </Row>
                  <Row label="주가상승률">
                    <NumInput value={cfg.growthRate} onChange={(v) => updateStockAccount(who, { growthRate: v })} suffix="%" />
                  </Row>
                  <Row label="성장배당 비율" hint="2026 개편 선택분리과세(15.4~33% 누진) 신청 배당 비중 · 0 = 기존 종합과세">
                    <NumInput value={cfg.growthDividendRatio ?? 0} onChange={(v) => updateStockAccount(who, { growthDividendRatio: v })} suffix="%" />
                  </Row>
                </div>
                {plan.stockInputMode==='assets'?<p className="text-xs text-emerald-300">현재 연결 연배당 {formatManwon(projection.stockInputs?.[who].annualDividend??0)} · 미래 목돈은 수령 연도부터 반영</p>:<div className="border-t border-gray-700/60 pt-1.5 space-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">잔액</span><span className="text-gray-100 font-semibold">{formatManwon(b.total)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">연배당</span><span className="text-emerald-400 font-semibold">{formatManwon(Math.round(b.dividendBase))}</span></div>
                  <p className="text-xs text-gray-600">{formatManwon(Math.round(b.dividendBase / 12))}/월 · 상승률로 매년 증가</p>
                  {(cfg.growthDividendRatio ?? 0) > 0 && (
                    <p className="text-xs text-amber-400/80">
                      성장배당 {cfg.growthDividendRatio}% 선택분리과세 (15.4/22/27.5/33% 누진)
                    </p>
                  )}
                </div>}
              </div>
            )
          })}
        </div>
        {plan.stockInputMode!=='assets'&&<p className="text-xs text-gray-600">
          합계 잔액 {formatManwon(sb.husband.total + sb.wife.total)} · 합계 연배당 {formatManwon(Math.round(sb.husband.dividendBase + sb.wife.dividendBase))}
        </p>}
    </div>
  )
}
