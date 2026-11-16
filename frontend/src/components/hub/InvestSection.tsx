// 허브 ④ 연금·주식 가정 — 배당률·상승률은 여기서만 고친다.
// 옮겨 온 곳: IRP 포트폴리오(생활비·목돈 입력), 일반주식계좌·수령 기본값(연금 시뮬), 소득 연동·보유세(현금흐름).
// 저장 위치는 그대로: PortfolioSettings / PensionSimPlan / RetirementPlan(linkCorpSim·linkPensionSim·holdingTax*).
import { AmountInput, NumInput, YearInput, Row, InfoTooltip, MoreInfo } from '@/components/sim'
import { PortfolioSection } from '@/components/retirement/PrepEditors'
import { StockAccountEditor } from '@/components/retirement/StockAccountEditor'
import { useAssets } from '@/hooks/useAssets'
import { usePlanner } from '@/planner/context'
import { analysisScope, scopeInputs } from '@/lib/analysisScope'
import { estimateHoldingTax, toHoldingTaxAssets } from '@/lib/holdingTax'
import { formatManwon } from '@/lib/utils'
import { usePensionDraft, usePensionProjection, usePortfolioDraft, useRetirementDraft } from './drafts'
import { SaveBar } from './SaveBar'

export const LINK_LABELS = { none: '등록 자산', corp: '🏛️ 법인', pension: '🪙 연금' } as const

export function InvestSection() {
  const retirement = useRetirementDraft()
  const pension = usePensionDraft()
  const portfolio = usePortfolioDraft()
  const { projection, linkPending, linkError } = usePensionProjection(pension.plan, retirement.saved?.lumpsum ?? [])
  const assetQuery = useAssets(), planner = usePlanner()
  const { plan } = retirement

  // 연동 소득원 — 법인/연금 상호배타 (기존 현금흐름 화면과 같은 필드)
  const linkMode: 'none' | 'corp' | 'pension' = plan.linkCorpSim ? 'corp' : plan.linkPensionSim ? 'pension' : 'none'
  const setLinkMode = (m: 'none' | 'corp' | 'pension') => {
    retirement.update('linkCorpSim', m === 'corp')
    retirement.update('linkPensionSim', m === 'pension')
  }
  // 보유세 자동 계산 미리보기 (은퇴 연도 기준, 합산 기준 적용 자산)
  const scoped = scopeInputs({ assets: assetQuery.data ?? [], dividends: undefined, pensionSim: undefined }, analysisScope(planner.data?.current))
  const realEstate = scoped.assets.filter((a) => a.type === 'REAL_ESTATE')
  const autoHold = estimateHoldingTax(toHoldingTaxAssets(realEstate), plan.retirementYear)

  const handleSave = async () => {
    try { await Promise.all([retirement.save(), pension.save(), portfolio.save()]) } catch { /* 오류 표시는 SaveBar */ }
  }
  if (!retirement.ready || !pension.ready || !portfolio.ready) return <p role="status" className="text-sm text-gray-400">불러오는 중…</p>
  const update = pension.update
  return (
    <div className="space-y-6" data-invest-editor>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">소득 계산 기준</h3>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="소득 연동">
          {(['none', 'corp', 'pension'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={linkMode === v} onClick={() => setLinkMode(v)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${linkMode === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              {LINK_LABELS[v]}
            </button>
          ))}
          <InfoTooltip text={'등록 자산: 등록 연금 지급액·배당으로 간이 추정\n법인: 저장된 법인 시뮬 설정 사용\n연금: 저장된 연금 시뮬 설정(명의별 세금·세대별 건보) 사용'} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">📊 IRP 계좌</h3>
        <PortfolioSection value={portfolio.value} onChange={portfolio.patch} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">📈 일반주식계좌 (남편/와이프)</h3>
        <StockAccountEditor plan={pension.plan} lumpsums={retirement.saved?.lumpsum ?? []} update={update}
          projection={projection} linkPending={linkPending} linkError={linkError} />
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-200">🪙 연금 수령 기본값</h3>
        <Row label="기본 수령개시연도" hint="개별 연금에 등록한 시작·종료 연도가 우선해요.">
          <YearInput value={pension.plan.startYear} onChange={(v) => update('startYear', v)} />
        </Row>
        <Row label="기본 수령 기간" hint="개별 종료 연도가 없을 때만 써요.">
          <NumInput value={pension.plan.withdrawalYears} onChange={v=>update('withdrawalYears',Math.max(1,Math.min(100,Math.round(v))))} suffix="년" />
        </Row>
      </div>

      {/* 보유세(재산세+종부세) — 자동: 부동산 자산에서 산출 / 수동: 직접 입력 (현금흐름 화면에서 옮김) */}
      <div className="space-y-2" data-holding-tax-editor>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-200">🏠 보유세 (재산세 + 종부세)</h3>
            <InfoTooltip text={
              (plan.holdingTaxAuto
                ? "부동산 자산(명의 지분·재건축 입주 연도 반영)에서\n재산세+종합부동산세를 연도별로 자동 계산합니다.\n\n"
                : "직접 입력한 연간 금액을 부과 개시 연도부터\n세금(연)에 합산합니다.\n\n") +
              "가정: 공시가격=시가×75%, 주택 과표 60%,\n도시지역분 0.14%, 종부세는 인별 일반공제 9억.\n1세대1주택 특례·경감·세부담상한 등 미반영 —\n근사 추정이므로 세무사 확인 필수."
            } />
          </div>
          <div className="flex items-center rounded-lg overflow-hidden border border-gray-600 shrink-0">
            {([['auto', '자동'], ['manual', '수동']] as const).map(([v, label]) => {
              const isAuto = v === 'auto'
              return (
                <button key={v} type="button" onClick={() => retirement.update('holdingTaxAuto', isAuto)}
                  className={`px-3 py-1.5 text-xs transition-colors ${plan.holdingTaxAuto === isAuto ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {plan.holdingTaxAuto ? (
          <p className="text-sm text-gray-300">자동 · {plan.retirementYear}년 기준 약 <b>{formatManwon(autoHold.total)}</b>/년</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400 w-20 shrink-0">연간 보유세</span>
              <div className="flex-1 min-w-[8rem]">
                <AmountInput value={plan.holdingTaxAnnual ?? 0} onChange={(v) => retirement.update('holdingTaxAnnual', v)} placeholder="재산세 + 종부세 합계 (연)" />
              </div>
              <span className="text-xs text-gray-400 shrink-0">부과 개시</span>
              <input type="number" inputMode="decimal" aria-label="보유세 부과 개시 연도"
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 text-center"
                value={plan.holdingTaxStartYear ?? ''} onChange={(e) => retirement.update('holdingTaxStartYear', Number(e.target.value) || undefined)} />
              <span className="text-xs text-gray-500">년~</span>
            </div>
            <MoreInfo>자동 계산 시 약 {formatManwon(autoHold.total)}/년 ({plan.retirementYear}년 기준) — '자동'으로 바꾸면 자산에서 매년 산출합니다.</MoreInfo>
          </div>
        )}
      </div>

      <SaveBar label="연금·주식 가정" dirty={retirement.dirty || pension.dirty || portfolio.dirty}
        saving={retirement.saving || pension.saving || portfolio.saving}
        error={retirement.error || pension.error || portfolio.error} onSave={() => void handleSave()} />
    </div>
  )
}
