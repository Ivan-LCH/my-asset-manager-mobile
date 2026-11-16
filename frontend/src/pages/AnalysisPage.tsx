import { Link, useSearchParams } from 'react-router-dom'
import PensionSimPage from './PensionSimPage'
import CorpSimPage from './CorpSimPage'
import RetirementPage from './RetirementPage'
import YearDashboardPage from './YearDashboardPage'
import { SegmentedTabs } from '@/components/common/SegmentedTabs'
import { MoreInfo } from '@/components/sim'
import { RetirementYearsSummary } from '@/components/retirement/RetirementYearsSummary'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement } from '@/hooks/useRetirement'
import { usePensionSim } from '@/hooks/usePensionSim'
import { retirementInputs } from '@/lib/analysisInputs'
import { hasSpouse } from '@/lib/people'
import { useMonthlyArchive } from '@/planner/archive'
import { HUB_PATH, hubLink, ANALYSIS_TABS, type AnalysisTab } from '@/components/hub/sections'
import { hubMissing } from '@/components/hub/checklist'

// 분석 = 결과만. 입력은 입력/설정 허브에서 (UI 간소화 A안). 연금·법인 시뮬 결과는 「고급」 탭에 접어 둔다.
const TABS = [
  { value:'year', label:'분석 요약', emoji:'📊' },
  { value:'cashflow', label:'연도별 현금흐름', emoji:'📅' },
  { value:'advanced', label:'고급', emoji:'🧪' },
]
export default function AnalysisPage() {
  const [params,setParams]=useSearchParams()
  const requested=params.get('tab')??'year'
  const tab:AnalysisTab=(ANALYSIS_TABS as readonly string[]).includes(requested)?requested as AnalysisTab:'year'
  const sim=params.get('sim')
  const assets=useAssets(), settings=useSettings(), retirement=useRetirement(), pension=usePensionSim()
  const inputs=retirementInputs(retirement.data,settings.data)
  const loading=[assets,settings,retirement].some(q=>q.isPending)
  const error=[assets,settings,retirement].find(q=>q.error)?.error
  const live=(assets.data??[]).filter(a=>!a.disposalDate)
  const missingCount=loading||pension.isPending?0:hubMissing(settings.data,retirement.data,pension.data).length
  const archive=useMonthlyArchive()
  return <div data-existing-analysis>
    <header className="max-w-screen-xl mx-auto px-4 pt-5 pb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">내 은퇴 분석</h1>
        {missingCount>0&&<Link to={HUB_PATH} data-missing-badge className="text-xs rounded-full bg-amber-500/20 text-amber-300 px-2.5 py-1">미입력 {missingCount}건 →</Link>}
      </div>
      {!loading&&<RetirementYearsSummary husband={inputs.missing.some(m=>m.label==='은퇴 예정 연도')?null:inputs.plan.retirementYear} wife={inputs.wifeYear} spouse={hasSpouse(settings.data??{})}/>}
      <MoreInfo label="연결된 입력">
        <ul className="space-y-1">
          <li><Link className="text-blue-300" to="/assets?type=ALL">현재 자산 {live.length}건 →</Link></li>
          <li><Link className="text-blue-300" to="/assets?type=PENSION">등록 연금 {live.filter(a=>a.type==='PENSION').length}건 · 지급액·기간 →</Link></li>
          <li><Link className="text-blue-300" to="/assets?type=STOCK">주식·배당 원본 →</Link></li>
          <li><Link className="text-blue-300" to={hubLink('living')}>생활비·여행·의료비 →</Link> · <Link className="text-blue-300" to={hubLink('lumpsum')}>목돈 →</Link></li>
          <li>은퇴 연도 출처: 본인 {inputs.yearSource}{inputs.wifeYear!=null&&<> · 와이프 {inputs.wifeYearSource}</>}{inputs.wifeYear!=null&&inputs.wifeYear>inputs.plan.retirementYear&&<> · 본인 은퇴 후 와이프가 일하는 기간({inputs.plan.retirementYear}~{inputs.wifeYear-1}년)은 피부양자 계획 모형 적용</>}</li>
          <li>소득 계산: {inputs.plan.linkCorpSim?'저장된 법인 설정':inputs.plan.linkPensionSim?'저장된 연금 설정':'등록 연금 지급액·배당'} <Link className="text-blue-300" to={hubLink('invest')}>수정</Link></li>
          {inputs.medicalMissing&&<li className="text-amber-300">의료비는 미입력입니다. 결과에 별도 의료비가 포함되지 않습니다.</li>}
        </ul>
      </MoreInfo>
      {archive===true&&<p className="text-sm"><Link className="text-blue-300" to="/analysis/archive" data-archive-link>보관된 월별 분석 (읽기 전용) →</Link></p>}
    </header>
    <SegmentedTabs tabs={TABS} value={tab} onChange={v=>setParams({tab:v})}/>
    {loading?<p role="status" className="p-6">입력을 불러오는 중…</p>:error?<p role="alert" className="p-6 text-red-300">입력을 읽지 못했습니다. 새로고침 후 다시 확인해 주세요.</p>:
      tab!=='advanced'&&inputs.missing.length>0?<section className="p-6 max-w-screen-xl mx-auto"><h2 className="text-lg font-semibold">이것만 채우면 분석을 볼 수 있어요</h2><MoreInfo className="my-2">이미 등록한 자산은 다시 입력하지 마세요. 빠진 정보를 임의의 예시 금액으로 채우지 않습니다.</MoreInfo><ul className="space-y-3">{inputs.missing.map(m=><li key={m.label}><Link className="text-blue-300 underline" to={m.to}>{m.label} 입력 →</Link></li>)}</ul></section>:
      <>{tab==='year'&&<YearDashboardPage/>}{tab==='cashflow'&&<RetirementPage/>}{tab==='advanced'&&<AdvancedPanel sim={sim}/>}</>}
  </div>
}

/** 분석 › 고급 — 연금·법인 시뮬 결과(입력 없음). 기본 접힘, ?sim=pension|corp 이면 그 패널을 연다. */
function AdvancedPanel({sim}:{sim:string|null}) {
  return <div className="max-w-screen-xl mx-auto p-4 md:p-6 space-y-4" data-analysis-advanced>
    <p className="text-sm text-gray-400">세금·법인 구조를 더 자세히 보고 싶을 때만 열어 보세요. 입력은 <Link className="text-blue-300 underline" to={hubLink('tax')}>입력/설정</Link>에서 고쳐요.</p>
    <details id="adv-pension" open={sim==='pension'||undefined} className="bg-gray-900/40 border border-gray-700 rounded-xl" data-advanced-panel="pension">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-200">🪙 연금 시뮬 결과</summary>
      <PensionSimPage/>
    </details>
    <details id="adv-corp" open={sim==='corp'||undefined} className="bg-gray-900/40 border border-gray-700 rounded-xl" data-advanced-panel="corp">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-200">🏛️ 법인 시뮬 결과</summary>
      <CorpSimPage mode="results"/>
    </details>
  </div>
}
