import {annualPension,irpTargetSources} from '@/lib/annualPension'
import {annualHealth} from '@/lib/annualHealth'
import {HealthBreakdown} from '@/components/retirement/HealthBreakdown'
import {FinancialTaxBreakdown} from '@/components/retirement/FinancialTaxBreakdown'
import {PensionIncomeDetails} from '@/components/retirement/PensionIncomeDetails'
import {annualVehicle} from '@/lib/annualVehicle'
import {annualIncomeTax} from '@/lib/incomeTax'
import {useSettings} from '@/hooks/useSettings'
import {IncomeTaxSettingsEditor} from '@/components/retirement/IncomeTaxSettingsEditor'
import {AnalysisNotices} from '@/components/retirement/AnalysisNotices'
import {PensionLedger} from '@/components/retirement/PensionLedger'
import {RegisteredPensionPlan} from '@/components/retirement/RegisteredPensionPlan'
import { useMemo } from 'react'
import { useAssets } from '@/hooks/useAssets'
import { pensionInputs, pensionInputNotes } from '@/lib/analysisInputs'
import { useDividendSummary } from '@/hooks/useDividends'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
// 연금 시뮬레이션 — 법인시뮬과 대칭되는 "연금·개인 vehicle" 모델. 1인(남편/와이프) 과세.
// 일반주식계좌 = 남편/와이프 각 계좌(잔액·배당률·상승률 입력). 종목 단위 입력은 사용 안 함.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { Expander, AmountInput, NumInput, YearInput, Row, InfoNote } from '@/components/sim'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { useRetirement } from '@/hooks/useRetirement'
import { useAssetsByType } from '@/hooks/useAssets'
import { usePortfolio } from '@/hooks/usePortfolio'
import {
  EMPTY_PENSION_PLAN,
  stockAccountBalances, stockBalanceFromInflows, totalInflows, sourcesFromAssets, pensionSchedule,
  FINANCIAL_INCOME_LIMIT,
} from '@/lib/pensionSim'
import { realEstatePropertyBases } from '@/lib/healthInsurance'
import { formatManwon, cn } from '@/lib/utils'
import {
  type PensionSimPlan, type Ownership, type OwnershipPreset, type StockAccountConfig,
  type PensionDetail, type PensionAllocation, type PensionSource,
  ownershipFromPreset, presetFromOwnership,
} from '@/types'

const uid = () => Math.random().toString(36).slice(2, 9)

/** 명의 프리셋 버튼행 */
function OwnershipPreset({ value, onChange, disabled, locked }: {
  value: Ownership; onChange: (o: Ownership) => void; disabled?: boolean; locked?: string
}) {
  const preset = presetFromOwnership(value)
  const labels: Record<OwnershipPreset, string> = { mine: '내 100%', half: '50:50', wife: '와이프 100%', custom: '직접' }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {(['mine', 'half', 'wife', 'custom'] as OwnershipPreset[]).map((p) => (
          <button key={p} disabled={disabled}
            onClick={() => onChange(ownershipFromPreset(p))}
            className={cn('flex-1 px-1.5 py-0.5 text-xs rounded transition-colors',
              preset === p ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600',
              disabled && 'opacity-40 cursor-not-allowed')}>
            {labels[p]}
          </button>
        ))}
      </div>
      {preset === 'custom' && !disabled && (
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            남편<NumInput value={value.husband} onChange={(v) => onChange({ husband: Math.min(100, Math.max(0, v)), wife: 100 - Math.min(100, Math.max(0, v)) })} suffix="%" />
          </label>
        </div>
      )}
      {locked && <p className="text-xs text-gray-600">{locked}</p>}
    </div>
  )
}

// ── 목돈 분배 카드 ──────────────────────────────────────────
// 퇴직IRP는 퇴직금(severance)일 때만 적용. 일반계좌는 항상. 나머지는 자동으로 현금보유.
function AllocationCard({ lumpsum, allocation, sources, onChange }: {
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
        <p className="text-xs text-gray-400">입금 연도에 해당 계좌 잔액에 합산합니다. 등록 월수령액은 입금 전후 잔액 비율로 재산정하며, 별도의 목돈 연금을 더하지 않습니다.</p>
        {isSeverance&&<label className="block text-xs text-gray-300">이 퇴직금의 이연퇴직소득세율 (국세 %)<input aria-label={lumpsum.name+' 이연퇴직소득세율 (국세 %)'} className="mt-1 w-full min-w-0 bg-gray-800 border border-gray-600 rounded p-2 text-sm" type="number" min="0" max="100" step="any" placeholder="미확인 · 기존 계좌 세율과 별도" value={allocation.irpRetirementTaxRate??''} onChange={e=>onChange({irpRetirementTaxRate:e.target.value===''?undefined:Math.min(100,Math.max(0,Number(e.target.value)))})}/><span className="block mt-1 text-gray-400">퇴직금 재원은 자동 연결합니다. 세율은 이 목돈의 이연퇴직소득세(국세) ÷ 이연퇴직소득 × 100이며, 모르면 비워두세요.</span></label>}
        {!allocation.irpSourceId&&sources.length!==1&&<p className="text-xs text-amber-300">연결 전에는 추가 연금이 미산정입니다. 현재 자산·기존 월수령액은 바뀌지 않습니다.</p>}
      </div>}
      <p className="text-xs text-gray-500">
        나머지(현금보유) <span className="text-gray-300 font-semibold">{formatManwon(cash)}</span>
        {cash > 0 && <span className="text-gray-600"> → 은퇴계획 목돈 수입</span>}
      </p>
    </div>
  )
}

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const {data:settings}=useSettings()
  const navigate = useNavigate()
  const { data: saved } = usePensionSim()
  const saveMut = useSavePensionSim()
  const assetQuery=useAssets()
  const dividendQuery=useDividendSummary(),ownersQuery=useStockAccountOwnership()
  const pensionAssets=(assetQuery.data??[]).filter(a=>a.type==='PENSION'&&!a.disposalDate)
  const realEstateAssets=(assetQuery.data??[]).filter(a=>a.type==='REAL_ESTATE')
  const { data: retirement } = useRetirement()
  const linkedInputs=useMemo(()=>pensionInputs(saved,assetQuery.data??[],retirement?.retirementYear),[saved,assetQuery.data,retirement?.retirementYear])
  const [plan,setPlan]=useState<PensionSimPlan>(()=>pensionInputs(null,[]))
  const [dirty,setDirty]=useState(false)
  useEffect(()=>{if(saved!==undefined&&!assetQuery.isPending&&!dirty)setPlan(linkedInputs)},[linkedInputs,saved,assetQuery.isPending,dirty])

  const update = useCallback(<K extends keyof PensionSimPlan>(key: K, val: PensionSimPlan[K]) => {
    setPlan((p) => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  // 목돈 분배 (lumpsumId 단위 upsert: 퇴직IRP/일반주식계좌 금액)
  const setAllocation = (lumpsumId: string, patch: Partial<Pick<PensionAllocation,'irpAmount'|'stockAmount'|'irpSourceId'|'irpRetirementTaxRate'>>) => {
    setPlan((p) => {
      const exists = p.allocations.some((a) => a.lumpsumId === lumpsumId)
      const allocations = exists
        ? p.allocations.map((a) => a.lumpsumId === lumpsumId ? { ...a, ...patch } : a)
        : [...p.allocations, { lumpsumId, irpAmount: 0, stockAmount: 0, ...patch }]
      return { ...p, allocations }
    })
    setDirty(true)
  }

  // 일반주식계좌(남편/와이프) 설정 변경
  const updateStockAccount = (who: 'husband' | 'wife', patch: Partial<StockAccountConfig>) => {
    setPlan((p) => ({ ...p, stockAccount: { ...p.stockAccount, [who]: { ...p.stockAccount[who], ...patch } } }))
    setDirty(true)
  }

  const handleSave = () => saveMut.mutate(pensionInputs(plan,assetQuery.data??[],retirement?.retirementYear), { onSuccess: () => setDirty(false) })

  // 부동산 명의 가중 → 1인별 건보 재산분
  const prop = realEstatePropertyBases(realEstateAssets, plan.refYear)

  // 국민연금 자산(확정급여) — 월수령액·수령개시연령 추출 (plan.sources에서 national로 분류된 것)
  const nationals = pensionAssets
    .filter((a) => plan.sources.find((s) => s.id === a.id)?.taxType === 'national')
    .map((a) => {
      const d = a.detail as PensionDetail | undefined
      return d ? {
        expectedStartYear: d.expectedStartYear,
        expectedEndYear: d.expectedEndYear,
        expectedMonthlyPayout: d.expectedMonthlyPayout,
        annualGrowthRate: d.annualGrowthRate ?? 0,
      } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // plan 자체가 stockAccount(남편/와이프 계좌 배당률·상승률)를 가지므로 effectivePlan 분리 불필요
  const effectivePlan = pensionInputs(plan,assetQuery.data??[],retirement?.retirementYear)
  // IRP 포트폴리오 상승률 (은퇴준비 IRP 포트폴리오) — IRP 퇴직시점 잔액 성장·수령액 산정용
  const { data: portfolio } = usePortfolio()
  const irpGrowthRate = portfolio?.growthRate ?? 0
  const projection=annualPension(effectivePlan,assetQuery.data??[],new Date().getFullYear(),Math.max(effectivePlan.refYear,effectivePlan.startYear+Math.max(1,effectivePlan.withdrawalYears)-1,...(effectivePlan.monthlyPlan?.accounts.map(a=>Number(a.end?.slice(0,4)??0))??[])),{simulation:true,growth:irpGrowthRate,dividend:portfolio?.dividendYield??0,lumpsums:retirement?.lumpsum??[],stockLink:{dividends:dividendQuery.data?.items,owners:ownersQuery.data}})
  const schedule=projection.rows
  const selectedRow=schedule.find(r=>r.year===plan.refYear)
  const h=annualVehicle(effectivePlan,selectedRow,prop,settings)
  const incomeTax=selectedRow?annualIncomeTax(selectedRow,effectivePlan,settings):null
  const health=selectedRow?annualHealth(selectedRow,effectivePlan,prop):null

  // Same health projection as the annual dashboard; private pension is not public pension income.
  const husbandHI = health?.husbandSeparate??{grandTotal:0,incomeMonthly:0,propertyMonthly:0}
  const wifeHI = health?.wifeSeparate??{grandTotal:0,incomeMonthly:0,propertyMonthly:0}
  const stockBalance = stockBalanceFromInflows(plan.allocations)
  const sb = stockAccountBalances(plan)
  const inflowTotal = totalInflows(plan)
  const irpInflow = plan.allocations.reduce((s, a) => s + a.irpAmount, 0)
  const stockInflow = plan.allocations.reduce((s, a) => s + a.stockAmount, 0)
  // 은퇴계획 목돈수입 (분배 대상, 단일 소스)
  const lumpsums = retirement?.lumpsum ?? []

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/pension')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-gray-100 truncate">🪙 개인투자시뮬 (가족)</h2>
        </div>
        <button onClick={handleSave} disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 shrink-0">
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <AnalysisNotices notes={[...projection.notes,...pensionInputNotes(saved,assetQuery.data??[])]} incomplete={projection.incomplete} shortfall={schedule.some(r=>r.shortfall>0)}/>
      <PensionLedger rows={schedule}/>
      <RegisteredPensionPlan plan={plan.monthlyPlan}/>
      {/* 면책 (기본 접힘 — 탭하면 전문) */}
      <InfoNote tone="warn" summary="세금·건보 추정치 — 적용 전 세무사 확인 필수">
        세금은 명의별 간이 추정이며, 건강보험은 선택한 지역가입 세대 단위로 추정합니다.
        자산 연결 연금은 최신 자산의 단독 명의, 수동 연금은 저장된 명의를 사용합니다. 실제는 규정·연도별 변동 → <b>세무사·노무사 확인 필수</b>.
      </InfoNote>

            {/* ═══ 입력 (사용자가 정하는 것) ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-gray-200">✏️ 입력</span>
        <span className="text-xs text-gray-600">목돈 자금 처리 · 일반주식계좌 · 과세·수령 기준</span>
      </div>

{/* + 목돈 분배 (은퇴계획 목돈수입 → 어디로) */}
      <Expander title="➕ 목돈 분배 (은퇴계획 목돈수입 기준)" badge={`${lumpsums.length}개`} defaultOpen>
        <InfoNote summary="목돈을 주식계좌·퇴직IRP·현금으로 분배">
          <p>
            은퇴계획의 <b>목돈수입</b>에 입력한 자금을 <b>어디로 넣을지</b> 정합니다.
            <b>일반주식계좌</b>는 항상 넣을 수 있고, <b>퇴직IRP</b>는 <b>퇴직금(위로금)일 때만</b> 선택 가능합니다.
            나누고 남은 금액은 자동으로 <b>현금보유</b>(은퇴계획 목돈 수입)가 됩니다.
          </p>
          <p>목돈의 수령 연도·금액은 분석 → 생활비·목돈 입력에서 수정합니다. 이체는 계좌 입금이며, 생활비 수입은 실제 연금 인출만 반영합니다.</p>
        </InfoNote>
        {lumpsums.length === 0 && (
          <p className="text-center text-xs text-gray-600 py-4">
            목돈수입이 없습니다. 은퇴계획(/retirement)의 목돈수입에서 먼저 추가하세요.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lumpsums.map((l) => {
            const alloc = plan.allocations.find((a) => a.lumpsumId === l.id) ?? { irpAmount: 0, stockAmount: 0 }
            return (
              <AllocationCard key={l.id} lumpsum={l} allocation={alloc} sources={irpTargetSources(plan,assetQuery.data??[])}
                onChange={(patch) => setAllocation(l.id, patch)} />
            )
          })}
        </div>
        <p className="text-xs text-gray-600">
          분배된 투자 원금 — 퇴직IRP {formatManwon(irpInflow)} · 일반주식계좌 {formatManwon(stockInflow)}
        </p>
      </Expander>

{/* 일반주식계좌 (남편/와이프 각 계좌) */}
      <Expander title="📈 일반주식계좌 (남편/와이프)">
        <label className="block text-xs text-gray-300 mb-3">투자금 입력 기준
          <select aria-label="일반주식 입력 기준" value={plan.stockInputMode??'manual'} onChange={e=>update('stockInputMode',e.target.value as PensionSimPlan['stockInputMode'])} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded p-2">
            <option value="manual">기존 수동 투자금·배당률</option><option value="assets">현재 일반주식 잔액·배당 연결</option>
          </select>
        </label>
        {plan.stockInputMode==='assets'&&<div className="text-xs text-blue-200 mb-3 space-y-2" data-linked-stock-inputs>
          <p>현재 보유한 일반주식의 평가액·명의·배당 예상액을 연결합니다. IRP 연결 계좌·연금성 계좌·처분 자산은 제외합니다. 수동 추가 금액은 보존하되 중복 합산하지 않습니다.</p>
          <p>시세·배당 설정 변경은 자산 화면에서 합니다. 현재 배당은 입력 정보 기반 예상치이며 확정 입금액이 아닙니다. 미래 목돈의 배당률·성장률은 아래 설정을 사용합니다.</p>
          {dividendQuery.isPending||ownersQuery.isPending?<p role="status">계좌·배당 정보를 불러오는 중…</p>:dividendQuery.error||ownersQuery.error?<p role="alert">계좌·배당 조회 실패: 연결 결과를 확정하지 마세요.</p>:<p>연결 계좌 {projection.stockInputs?.accounts.length??0}개 · 현재 잔액 {formatManwon((projection.stockInputs?.husband.balance??0)+(projection.stockInputs?.wife.balance??0))}</p>}
          <details><summary className="cursor-pointer">연결 계좌 근거</summary>{projection.stockInputs?.accounts.map(a=><p key={a.id} className="mt-1 break-words">{a.name}: 잔액 {formatManwon(a.balance)} · 연배당 {formatManwon(a.annualDividend)}</p>)}</details>
        </div>}
        {plan.stockInputMode!=='assets'&&<InfoNote summary="배당률·상승률만 입력 → 연배당·성장 자동 산정">
          <p>
            잔액 = <b>목돈 분배(stock) 합계 × 명의지분</b> + <b>추가 금액</b>. 종목 입력 없이
            <b> 계좌 단위 배당률·상승률</b>만 입력 → 연배당·연도별 성장 자동 산정.
            <b> 성장배당 비율</b> = 2026 세제개편 선택분리과세 적용 배당 비중 (0% = 기존 종합과세).
          </p>
          <p>목돈 분배금 변경: 위 '목돈 분배' 섹션. 현재 stock 분배 합계 {formatManwon(stockBalance)}.</p>
        </InfoNote>}
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
      </Expander>

      {/* 과세·수령 기준 — 은퇴준비에서 이관(과세) + 숨은 기본값 공개(수령개시) (UI 간소화 ③) */}
      <Expander title="⚙️ 과세·수령 기준" badge="연금·금융 통합 계산">
        <InfoNote summary="기본값 그대로 사용 — 필요 시 여기서 편집">
          개별 연금의 수령 기간이 우선이며, 비어 있는 항목만 아래 기본값을 사용합니다.
          국민연금과 종합합산을 선택한 사적연금은 연금소득공제 후 금융·기타소득과 함께 계산합니다.
          퇴직금 재원은 분리합니다. 기존 배우자·표준공제의 절반 배분 및 고정 1,200만원 연금공제는 더 이상 적용하지 않습니다.
        </InfoNote>
        <Row label="기본 수령개시연도" hint="개별 연금에 등록한 시작·종료 연도가 우선합니다.">
          <YearInput value={plan.startYear} onChange={(v) => update('startYear', v)} />
        </Row>
        <Row label="기본 수령 기간" hint="개별 종료 연도가 없을 때만 사용합니다. 저장된 실제 기간이며 고정값이 아닙니다.">
          <NumInput value={plan.withdrawalYears} onChange={v=>update('withdrawalYears',Math.max(1,Math.min(100,Math.round(v))))} suffix="년" />
        </Row>
        <label className="block text-xs text-gray-300 my-3">건강보험 가입 가정
          <select aria-label="건강보험 가입 가정" value={plan.healthHouseholdMode??''} onChange={e=>update('healthHouseholdMode',(e.target.value||undefined) as PensionSimPlan['healthHouseholdMode'])} className="mt-1 w-full bg-gray-800 border border-gray-600 rounded p-2">
            <option value="">미확인 · 같은 지역가입 세대로 추정</option><option value="joint">부부가 같은 지역가입 세대</option><option value="separate">부부가 각각 별도 지역가입 세대</option>
          </select><span className="block text-gray-400 mt-1">직장가입자·피부양자 자격 판단은 지원하지 않습니다. 해당되면 이 지역가입 추정액을 사용하지 마세요.</span>
        </label>
        <Row label="기타 종합소득(연)" hint="남편 근로/사업 소득 등">
          <AmountInput value={plan.otherIncome} onChange={(v) => update('otherIncome', v)} />
        </Row>
        <p className="text-xs text-gray-400">소득공제·배당공제·연금 재원은 아래 세금 추가정보에서 확인합니다. 이전 공제 설정은 백업에 보존하지만 새 계산에 사용하지 않습니다.</p>
      </Expander>
      <IncomeTaxSettingsEditor plan={{...effectivePlan,sources:projection.sources}} onChange={value=>update('incomeTaxSettings',value)} onTransfers={value=>update('irpTransfers',value)} onSave={handleSave} dirty={dirty} saving={saveMut.isPending}/>

      {/* ═══ 결과 (자동 계산) ═══ */}
      {/* ═══ 개요 (한눈에 보기) ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-emerald-400">개요</span>
        <span className="text-xs text-gray-600">투자 원금 · 기준년도 수입·지출 (가족 합산)</span>
      </div>

{/* 투자 원금 요약 (유입이 만든 원금) */}
      {(() => {
        const irpHusband = plan.sources.filter(s => (s.taxType==='irp'||s.taxType==='taxable') && s.owner==='husband').reduce((s,x)=>s+x.principal,0) + irpInflow
        const irpWife = plan.sources.filter(s => (s.taxType==='irp'||s.taxType==='taxable') && s.owner==='wife').reduce((s,x)=>s+x.principal,0)
        const PrincipalCard = ({ title, husband, wife, note }: { title: string; husband: number; wife: number; note?: string }) => (
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-1">{title}</p>
            <div className="grid grid-cols-3 gap-1 text-xs">
              <div><p className="text-xs text-blue-400">남편</p><p className="text-gray-100 font-semibold">{formatManwon(husband)}</p></div>
              <div><p className="text-xs text-pink-400">와이프</p><p className="text-gray-100 font-semibold">{formatManwon(wife)}</p></div>
              <div><p className="text-xs text-gray-400">합산(가족)</p><p className="text-emerald-400 font-semibold">{formatManwon(husband + wife)}</p></div>
            </div>
            {note && <p className="text-xs text-gray-600 mt-1">{note}</p>}
          </div>
        )
        return (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">💼 투자 원금 요약 (남편/와이프)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-900/50 rounded-lg p-2.5"><p className="text-gray-400">{plan.refYear}년말 연금 계좌 잔액</p><p className="font-semibold text-gray-100">{formatManwon(selectedRow?.closing??0)}</p><p className="text-gray-400 mt-1">입금 시점·운용·지급을 반영한 같은 계좌 원장입니다. 미래 입금을 현재 원금에 미리 더하지 않습니다.</p>{(selectedRow?.accounts.some(a=>a.pending&&a.closing>0))&&<p className="text-amber-300">연결 대기 원금 포함 · 추가 연금 미산정</p>}</div>
              <PrincipalCard title={`${plan.refYear}년말 일반주식 예상 잔액`} husband={h.husband.stockBalance} wife={h.wife.stockBalance}
                note={`${plan.refYear}년 예상 연배당 ${formatManwon(selectedRow?.financialAnnual??0)} · 연도별 현금흐름과 같은 계산`} />
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              💡 분배하지 않은 나머지는 현금 수령(은퇴계획 목돈)으로, 투자 원금에서 제외됨.
            </p>
          </div>
        )
      })()}

      {/* 기준년도 수입·지출 스냅샷 (가족 합산) */}
      <div className="bg-gray-800 border border-emerald-700/40 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-300">📅 기준년도 수입·지출 (가족 합산)</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">기준년도</span>
            <input type="number" inputMode="decimal"
              className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
              value={plan.refYear} onChange={(e) => update('refYear', Number(e.target.value))} />
            <span className="text-xs text-gray-500">년</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">연금수령액(연)</p>
            <p className="text-gray-100 font-semibold">{formatManwon(h.totals.grossAnnual - (h.totals.financialIncome))}</p>
            <p className="text-xs text-gray-600">{formatManwon(Math.round((h.totals.grossAnnual - h.totals.financialIncome) / 12))}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">배당금(연)</p>
            <p className="text-emerald-400 font-semibold">{formatManwon(h.totals.financialIncome)}</p>
            <p className="text-xs text-gray-600">{formatManwon(Math.round(h.totals.financialIncome / 12))}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">지출 — 세금(연)+걸보(월)</p>
            <p className="text-red-400 font-semibold">{formatManwon(h.totals.totalAnnualTax)} + {formatManwon(h.totals.healthMonthly)}/월</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">순소득(월)</p>
            <p className="text-emerald-400 font-semibold">{formatManwon(Math.round(h.totals.netAnnual / 12) - h.totals.healthMonthly)}/월</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {plan.refYear}년 기준. 각 연금의 등록 수령 시작·종료 연도를 사용합니다. 세금은 공적연금·금융 통합 및 사적연금 선택 과세 추정이며 미확정 항목은 세금 상세에서 확인하세요. 건강보험은 가입 세대 가정에 따른 추정입니다.
        </p>
      </div>

      {/* ═══ 수입 상세 ═══ */}
      {selectedRow&&<details className="bg-gray-800 border border-gray-700 rounded-xl p-4"><summary className="cursor-pointer text-sm text-blue-300">연금별 월수령액·추가 입금 근거</summary><div className="mt-3"><PensionIncomeDetails row={selectedRow} rows={schedule}/></div></details>}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-emerald-400">수입 상세</span>
        <span className="text-xs text-gray-600">연금수입 + 배당수입</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 연금수입 */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-gray-300 mb-2">🛡️ 연금수입 (월 / 연)</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">과세 연금 (국민연금 포함)</span><span className="text-right"><span className="text-gray-100 font-semibold">{formatManwon(Math.round((h.husband.annualPensionTaxable+h.wife.annualPensionTaxable) / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon((h.husband.annualPensionTaxable+h.wife.annualPensionTaxable))})</span></span></div>
            <div className="flex justify-between"><span className="text-gray-500">비과세 연금 (98년)</span><span className="text-right"><span className="text-gray-100 font-semibold">{formatManwon(Math.round((h.husband.annualPensionExempt+h.wife.annualPensionExempt) / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon((h.husband.annualPensionExempt+h.wife.annualPensionExempt))})</span></span></div>
            <p className="text-xs text-gray-400">국민연금 포함: {formatManwon(selectedRow?.nationalAnnual??0)}/연 · 위 과세 연금에 포함된 내역입니다.</p>
           <div className="flex justify-between border-t border-gray-700 pt-1.5"><span className="text-gray-400 font-semibold">연금수입 합계</span><span className="text-right"><span className="text-emerald-400 font-bold">{formatManwon(Math.round(((h.husband.annualPensionTaxable+h.wife.annualPensionTaxable) + (h.husband.annualPensionExempt+h.wife.annualPensionExempt)) / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon((h.husband.annualPensionTaxable+h.wife.annualPensionTaxable) + (h.husband.annualPensionExempt+h.wife.annualPensionExempt))})</span></span></div>
            <p className="text-xs text-gray-400">등록 지급 기간을 사용합니다. 계좌 인출형은 지급 가능한 잔액 이내로 제한하고, 국민연금은 원금 인출로 계산하지 않습니다.</p>
          </div>
        </div>
        {/* 배당수입 */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-gray-300 mb-2">📈 배당수입 (월 / 연)</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">일반주식계좌 배당</span><span className="text-right"><span className="text-emerald-400 font-semibold">{formatManwon(Math.round(h.totals.financialIncome / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon(h.totals.financialIncome)})</span></span></div>
            <div className="flex justify-between"><span className="text-xs text-gray-600">— 남편</span><span className="text-right"><span className="text-gray-300">{formatManwon(Math.round(h.husband.financialIncome / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon(h.husband.financialIncome)})</span></span></div>
            <div className="flex justify-between"><span className="text-xs text-gray-600">— 와이프</span><span className="text-right"><span className="text-gray-300">{formatManwon(Math.round(h.wife.financialIncome / 12))}</span><span className="text-gray-500 ml-1">(연 {formatManwon(h.wife.financialIncome)})</span></span></div>
            <p className="text-xs text-gray-400">{plan.refYear}년말 설정 계좌 잔액: 남편 {formatManwon(selectedRow?.stockHusband??0)} · 와이프 {formatManwon(selectedRow?.stockWife??0)}. 목돈은 등록 수령 연도부터 반영됩니다.</p>
            <p className="text-xs text-gray-600 mt-1 pt-1 border-t border-gray-700/50">※ 연금저축의 배당수입은 <b>배당재투자</b>로 들어가 별도 수입으로 잡지 않습니다.</p>
          </div>
        </div>
      </div>

      {/* ═══ 지출 상세 ═══ */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-bold text-red-400">지출 상세</span>
        <span className="text-xs text-gray-600">세금은 명의별 · 건강보험은 세대별</span>
      </div>

      {health&&<div className="bg-gray-800 border border-gray-700 rounded-xl p-4"><HealthBreakdown value={health}/></div>}
      {selectedRow&&<FinancialTaxBreakdown row={selectedRow} plan={effectivePlan}/>}
      {incomeTax&&(incomeTax.husband.unresolvedPension>0||incomeTax.wife.unresolvedPension>0)&&<p role="status" className="text-sm text-amber-200">아래 세금은 확인된 항목의 소계입니다. 재원·세율 미확정 IRP 세금이 추가될 수 있습니다.</p>}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 px-3 font-medium whitespace-nowrap"></th>
              <th className="text-right py-2 px-3 font-medium">💸 세금 (월 / 연)</th>
              <th className="text-right py-2 px-3 font-medium">🏥 건보료 (월 / 연)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-700/50">
              <td className="py-2 px-3 text-blue-400 font-medium whitespace-nowrap">🧑 남편</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-semibold">{formatManwon(Math.round(h.husband.totalAnnualTax / 12))}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(h.husband.totalAnnualTax)})</span>
                <p className="text-xs text-gray-400">분리 연금세 {formatManwon(Math.round(h.husband.pensionTax / 12))} · 종합·금융세 {formatManwon(Math.round(h.husband.financialTax / 12))}</p>
              </td>
              <td className="py-2 px-3 text-right">
                {health?.mode==='joint'?<span className="text-gray-400">세대 합산으로 계산</span>:<><span className="text-gray-100 font-semibold">{formatManwon(husbandHI.grandTotal)}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(husbandHI.grandTotal * 12)})</span>
                <p className="text-xs text-gray-600">소득분 {formatManwon(husbandHI.incomeMonthly)} · 재산분 {formatManwon(husbandHI.propertyMonthly)}</p></>}
              </td>
            </tr>
            <tr className="border-b border-gray-700/50">
              <td className="py-2 px-3 text-pink-400 font-medium whitespace-nowrap">👩 와이프</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-semibold">{formatManwon(Math.round(h.wife.totalAnnualTax / 12))}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(h.wife.totalAnnualTax)})</span>
                <p className="text-xs text-gray-400">분리 연금세 {formatManwon(Math.round(h.wife.pensionTax / 12))} · 종합·금융세 {formatManwon(Math.round(h.wife.financialTax / 12))}</p>
              </td>
              <td className="py-2 px-3 text-right">
                {health?.mode==='joint'?<span className="text-gray-400">세대 합산으로 계산</span>:<><span className="text-gray-100 font-semibold">{formatManwon(wifeHI.grandTotal)}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(wifeHI.grandTotal * 12)})</span>
                <p className="text-xs text-gray-600">소득분 {formatManwon(wifeHI.incomeMonthly)} · 재산분 {formatManwon(wifeHI.propertyMonthly)}</p></>}
              </td>
            </tr>
            <tr className="bg-gray-900/40">
              <td className="py-2 px-3 text-gray-300 font-semibold whitespace-nowrap">🏠 가족</td>
              <td className="py-2 px-3 text-right">
                <span className="text-red-400 font-bold">{formatManwon(Math.round(h.totals.totalAnnualTax / 12))}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(h.totals.totalAnnualTax)})</span>
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-gray-100 font-bold">{formatManwon(h.totals.healthMonthly)}</span>
                <span className="text-gray-500 ml-1">(연 {formatManwon(h.totals.healthMonthly * 12)})</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-600 px-3 py-2 border-t border-gray-700">
          세금 = 종합·금융세 + 분리 연금세 (해외 납부액이 있으면 포함). 국민연금 종합합산 세금은 종합·금융세에 포함되며 연금세로 중복 가산하지 않습니다. 건보는 세대별 별도 계산. {plan.refYear}년 기준.
        </p>
      </div>
    </div>
  )
}
