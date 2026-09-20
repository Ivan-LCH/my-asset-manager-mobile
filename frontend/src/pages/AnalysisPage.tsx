import { Link, useSearchParams } from 'react-router-dom'
import RetirementPrepPage from './RetirementPrepPage'
import PensionSimPage from './PensionSimPage'
import CorpSimPage from './CorpSimPage'
import RetirementPage from './RetirementPage'
import YearDashboardPage from './YearDashboardPage'
import { SegmentedTabs } from '@/components/common/SegmentedTabs'
import { useAssets } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { useRetirement } from '@/hooks/useRetirement'
import { retirementInputs } from '@/lib/analysisInputs'

const TABS = [
  { value:'year', label:'분석 요약', emoji:'📊' },
  { value:'cashflow', label:'연도별 현금흐름', emoji:'📅' },
  { value:'prep', label:'생활비·목돈 입력', emoji:'✏️' },
]
export default function AnalysisPage() {
  const [params,setParams]=useSearchParams()
  const requested=params.get('tab')??'year'
  const tab=['year','prep','cashflow','pension-sim','corp-sim'].includes(requested)?requested:'year'
  const assets=useAssets(), settings=useSettings(), retirement=useRetirement()
  const inputs=retirementInputs(retirement.data,settings.data)
  const loading=[assets,settings,retirement].some(q=>q.isPending)
  const error=[assets,settings,retirement].find(q=>q.error)?.error
  const live=(assets.data??[]).filter(a=>!a.disposalDate)
  const resultTab=tab==='year'||tab==='cashflow'
  return <div data-existing-analysis>
    <header className="max-w-screen-xl mx-auto px-4 pt-5 pb-3 space-y-2">
      <h1 className="text-xl font-bold">내 은퇴 분석</h1>
      <p className="text-sm text-gray-400">등록한 자산·연금·생활비로 자동 계산합니다. 새 계획을 다시 입력할 필요가 없습니다.</p>
      <details className="text-sm border border-gray-700 rounded-lg p-3">
        <summary className="cursor-pointer">연결된 입력 확인 · 수정은 원래 화면에서</summary>
        <ul className="space-y-2 mt-3 text-gray-300">
          <li><Link className="text-blue-300" to="/assets?type=ALL">현재 자산 {live.length}건 →</Link></li>
          <li><Link className="text-blue-300" to="/assets?type=PENSION">등록 연금 {live.filter(a=>a.type==='PENSION').length}건 · 지급액·기간 →</Link></li>
          <li><Link className="text-blue-300" to="/assets?type=STOCK">주식·배당 원본 →</Link></li>
          <li><Link className="text-blue-300" to="/analysis?tab=prep">생활비·목돈·여행·의료비 →</Link></li>
          <li>은퇴 연도: {inputs.missing.some(m=>m.label==='은퇴 예정 연도')?'미입력':inputs.plan.retirementYear} · 출처: {inputs.yearSource} <Link className="text-blue-300" to={inputs.yearSource==='설정'?'/settings':'/analysis?tab=cashflow'}>수정 →</Link></li>
          <li>소득 계산: {inputs.plan.linkCorpSim?'저장된 법인 설정':inputs.plan.linkPensionSim?'저장된 연금 설정':'등록 연금 지급액·배당'} · 기존 연동 선택을 유지합니다.</li>
          {inputs.medicalMissing&&<li className="text-amber-300">의료비는 미입력입니다. 결과에 별도 의료비가 포함되지 않습니다.</li>}
        </ul>
      </details>
      <details className="text-sm text-gray-400" open={tab==='pension-sim'||tab==='corp-sim'} key={tab==='pension-sim'||tab==='corp-sim'?'detail':'basic'}>
        <summary className="cursor-pointer py-2">세부 계산·고급 기능</summary>
        <div className="flex flex-wrap gap-3 py-2 text-blue-300">
          <Link to="/analysis?tab=pension-sim">연금 시뮬레이션</Link><Link to="/analysis?tab=corp-sim">법인 시뮬레이션</Link>
          <Link to="/plan">별도 월별 계획 편집</Link><Link to="/advanced-analysis">보관한 월별 분석</Link>
        </div><p className="text-xs">월별 계획은 별도 가정입니다. 기본 분석과 합산하지 않으며 기존 저장 결과도 보존합니다.</p>
      </details>
    </header>
    <SegmentedTabs tabs={TABS} value={tab} onChange={v=>setParams({tab:v})}/>
    {loading?<p role="status" className="p-6">기존 입력을 불러오는 중…</p>:error?<p role="alert" className="p-6 text-red-300">입력을 읽지 못했습니다. 새로고침 후 다시 확인해 주세요.</p>:
      resultTab&&inputs.missing.length>0?<section className="p-6 max-w-screen-xl mx-auto"><h2 className="text-lg font-semibold">이 정보만 확인하면 분석을 볼 수 있습니다</h2><p className="text-sm text-gray-400 my-2">이미 등록한 자산은 다시 입력하지 마세요. 빠진 정보를 임의의 예시 금액으로 채우지 않습니다.</p><ul className="space-y-3">{inputs.missing.map(m=><li key={m.label}><Link className="text-blue-300 underline" to={m.to}>{m.label} 확인 →</Link></li>)}</ul></section>:
      <>{tab==='year'&&<YearDashboardPage/>}{tab==='cashflow'&&<RetirementPage/>}{tab==='prep'&&<RetirementPrepPage/>}{tab==='pension-sim'&&<PensionSimPage/>}{tab==='corp-sim'&&<CorpSimPage/>}</>}
  </div>
}
