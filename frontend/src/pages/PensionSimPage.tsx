import {annualPension} from '@/lib/annualPension'
import {annualHealth} from '@/lib/annualHealth'
import {HealthBreakdown} from '@/components/retirement/HealthBreakdown'
import {FinancialTaxBreakdown} from '@/components/retirement/FinancialTaxBreakdown'
import {PensionIncomeDetails} from '@/components/retirement/PensionIncomeDetails'
import {annualVehicle} from '@/lib/annualVehicle'
import {annualIncomeTax} from '@/lib/incomeTax'
import {useSettings} from '@/hooks/useSettings'
import {AnalysisNotices} from '@/components/retirement/AnalysisNotices'
import {PensionLedger} from '@/components/retirement/PensionLedger'
import {RegisteredPensionPlan} from '@/components/retirement/RegisteredPensionPlan'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAssets } from '@/hooks/useAssets'
import { pensionInputs, pensionInputNotes } from '@/lib/analysisInputs'
import { useDividendSummary } from '@/hooks/useDividends'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
// 연금 시뮬레이션 결과 — 분석 › 고급. 입력(목돈 분배·일반주식계좌·과세·세금 추가정보)은 입력/설정 허브로 옮겼다.
// 계산은 그대로: 저장된 연금 시뮬 설정 + 자산으로 같은 원장(annualPension)·세금·건보를 산출. 기준년도는 보기 전용(저장 안 함).
import { useState } from 'react'
import { InfoNote, MoreInfo } from '@/components/sim'
import { usePensionSim } from '@/hooks/usePensionSim'
import { useRetirement } from '@/hooks/useRetirement'
import { usePortfolio } from '@/hooks/usePortfolio'
import { realEstatePropertyBases } from '@/lib/healthInsurance'
import { formatManwon } from '@/lib/utils'
import { hubLink } from '@/components/hub/sections'
import type { PensionSimPlan, PensionDetail } from '@/types'

// ── 메인 ───────────────────────────────────────────────────
export default function PensionSimPage() {
  const {data:settings}=useSettings()
  const { data: saved } = usePensionSim()
  const assetQuery=useAssets()
  const dividendQuery=useDividendSummary(),ownersQuery=useStockAccountOwnership()
  const pensionAssets=(assetQuery.data??[]).filter(a=>a.type==='PENSION'&&!a.disposalDate)
  const realEstateAssets=(assetQuery.data??[]).filter(a=>a.type==='REAL_ESTATE')
  const { data: retirement } = useRetirement()
  const lumpsums = retirement?.lumpsum ?? []
  const linkedInputs=useMemo(()=>pensionInputs(saved,assetQuery.data??[],retirement?.retirementYear),[saved,assetQuery.data,retirement?.retirementYear])
  // 기준년도는 결과 보기용 — 바꿔도 저장하지 않는다
  const [refYearView,setRefYear]=useState<number|null>(null)
  const plan:PensionSimPlan=useMemo(()=>refYearView!=null?{...linkedInputs,refYear:refYearView}:linkedInputs,[linkedInputs,refYearView])

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
  const projection=annualPension(effectivePlan,assetQuery.data??[],new Date().getFullYear(),Math.max(effectivePlan.refYear,effectivePlan.startYear+Math.max(1,effectivePlan.withdrawalYears)-1,...(effectivePlan.monthlyPlan?.accounts.map(a=>Number(a.end?.slice(0,4)??0))??[])),{simulation:true,growth:irpGrowthRate,dividend:portfolio?.dividendYield??0,lumpsums,stockLink:{dividends:dividendQuery.data?.items,owners:ownersQuery.data}})
  const schedule=projection.rows
  const selectedRow=schedule.find(r=>r.year===plan.refYear)
  const h=annualVehicle(effectivePlan,selectedRow,prop,settings)
  const incomeTax=selectedRow?annualIncomeTax(selectedRow,effectivePlan,settings):null
  const health=selectedRow?annualHealth(selectedRow,effectivePlan,prop):null

  // Same health projection as the annual dashboard; private pension is not public pension income.
  const husbandHI = health?.husbandSeparate??{grandTotal:0,incomeMonthly:0,propertyMonthly:0}
  const wifeHI = health?.wifeSeparate??{grandTotal:0,incomeMonthly:0,propertyMonthly:0}
  const irpInflow = plan.allocations.reduce((s, a) => s + a.irpAmount, 0)
  const stockInflow = plan.allocations.reduce((s, a) => s + a.stockAmount, 0)

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-100 truncate">🪙 개인투자시뮬 (가족)</h2>
        <Link className="text-sm text-blue-300 underline" to={hubLink('invest')}>가정 수정 →</Link>
      </div>
      <AnalysisNotices notes={[...projection.notes,...pensionInputNotes(saved,assetQuery.data??[])]} incomplete={projection.incomplete} shortfall={schedule.some(r=>r.shortfall>0)}/>
      <PensionLedger rows={schedule}/>
      <RegisteredPensionPlan plan={plan.monthlyPlan}/>
      {/* 면책 (기본 접힘 — 탭하면 전문) */}
      <InfoNote tone="warn" summary="세금·건보 추정치 — 적용 전 세무사 확인 필수">
        세금은 명의별 간이 추정이며, 건강보험은 선택한 지역가입 세대 단위로 추정합니다.
        자산 연결 연금은 최신 자산의 단독 명의, 수동 연금은 저장된 명의를 사용합니다. 실제는 규정·연도별 변동 → <b>세무사·노무사 확인 필수</b>.
      </InfoNote>

      {/* 입력 요약 (읽기 전용) — 수정은 입력/설정 허브 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs text-gray-300 flex flex-wrap gap-x-4 gap-y-1" data-pension-input-summary>
        <span>목돈 분배 퇴직IRP {formatManwon(irpInflow)} · 일반주식 {formatManwon(stockInflow)} <Link className="text-blue-300 underline" to={hubLink('lumpsum')}>수정</Link></span>
        <span>배당률 남편 {plan.stockAccount.husband.dividendYield}% · 와이프 {plan.stockAccount.wife.dividendYield}% <Link className="text-blue-300 underline" to={hubLink('invest')}>수정</Link></span>
        <span>건보 {plan.healthHouseholdMode==='joint'?'같은 세대':plan.healthHouseholdMode==='separate'?'별도 세대':'미확인'} <Link className="text-blue-300 underline" to={hubLink('tax')}>수정</Link></span>
      </div>
      {plan.stockInputMode==='assets'&&<details className="text-xs text-blue-200" data-linked-stock-inputs><summary className="cursor-pointer">현재 일반주식 연결 근거 · 계좌 {projection.stockInputs?.accounts.length??0}개 · 잔액 {formatManwon((projection.stockInputs?.husband.balance??0)+(projection.stockInputs?.wife.balance??0))}</summary>{dividendQuery.isPending||ownersQuery.isPending?<p role="status">계좌·배당 정보를 불러오는 중…</p>:dividendQuery.error||ownersQuery.error?<p role="alert">계좌·배당 조회 실패: 연결 결과를 확정하지 마세요.</p>:projection.stockInputs?.accounts.map(a=><p key={a.id} className="mt-1 break-words">{a.name}: 잔액 {formatManwon(a.balance)} · 연배당 {formatManwon(a.annualDividend)}</p>)}</details>}

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
              <div className="bg-gray-900/50 rounded-lg p-2.5"><p className="text-gray-400">{plan.refYear}년말 연금 계좌 잔액</p><p className="font-semibold text-gray-100">{formatManwon(selectedRow?.closing??0)}</p><MoreInfo className="mt-1">입금 시점·운용·지급을 반영한 같은 계좌 원장입니다. 미래 입금을 현재 원금에 미리 더하지 않습니다.</MoreInfo>{(selectedRow?.accounts.some(a=>a.pending&&a.closing>0))&&<p className="text-amber-300">연결 대기 원금 포함 · 추가 연금 미산정</p>}</div>
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
              aria-label="기준년도 (보기)" value={plan.refYear} onChange={(e) => setRefYear(Number(e.target.value))} />
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
        <MoreInfo className="mt-1.5">
          {plan.refYear}년 기준. 각 연금의 등록 수령 시작·종료 연도를 사용합니다. 세금은 공적연금·금융 통합 및 사적연금 선택 과세 추정이며 미확정 항목은 세금 상세에서 확인하세요. 건강보험은 가입 세대 가정에 따른 추정입니다.
        </MoreInfo>
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
            <MoreInfo>등록 지급 기간을 사용합니다. 계좌 인출형은 지급 가능한 잔액 이내로 제한하고, 국민연금은 원금 인출로 계산하지 않습니다.</MoreInfo>
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
        <MoreInfo className="px-3 py-2 border-t border-gray-700">
          세금 = 종합·금융세 + 분리 연금세 (해외 납부액이 있으면 포함). 국민연금 종합합산 세금은 종합·금융세에 포함되며 연금세로 중복 가산하지 않습니다. 건보는 세대별 별도 계산. {plan.refYear}년 기준.
        </MoreInfo>
      </div>
    </div>
  )
}
