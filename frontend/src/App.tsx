import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import AssetsPage from '@/pages/AssetsPage'
import AnalysisPage from '@/pages/AnalysisPage'
import Settings from '@/pages/Settings'
import { getAllAssets, seedSampleData, isDemoDatabase } from '@/lib/db'
import { PlannerProvider } from '@/planner/context'
import UpdatePrompt from '@/components/common/UpdatePrompt'
import { PlannerHome, ArchivedMonthlyAnalysis, AssetInspect } from '@/planner/pages'
import TotalsPolicyPage from '@/planner/TotalsPolicyPage'
import { legacyPlannerRedirect } from '@/planner/archive'

const qc = new QueryClient()
let demoSeed: Promise<void> | undefined
function DemoBanner() {
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!isDemoDatabase)return
    demoSeed ??= getAllAssets().then(async assets=>{if(!assets.length)await seedSampleData()}).then(()=>{void qc.invalidateQueries()})
    void demoSeed.catch(e=>setError(String(e)))
  },[])
  if(!isDemoDatabase)return null
  return <div className="bg-amber-900 text-amber-100 p-3 text-center text-sm" role="status">샘플 전용 저장소 · 실제 자산과 분리됨 {error}<button className="underline ml-3" onClick={()=>{sessionStorage.removeItem('myasset-demo');location.href='/'}}>실제 자산으로 돌아가기</button></div>
}
function LegacyAnalysis() {
  const location=useLocation(); return <Navigate replace to={'/analysis'+location.search+location.hash}/>
}
// 월별 계획(/plan, /advanced-analysis, /analysis?run=)은 보관 화면 또는 설정 › 합산 기준으로 보낸다
function LegacyPlannerRedirect() {
  const location=useLocation(); return <Navigate replace to={legacyPlannerRedirect(location.pathname,location.search)}/>
}
function AnalysisEntry() { const [params]=useSearchParams(); return params.has('run')?<LegacyPlannerRedirect/>:<AnalysisPage/> }
export default function App() {
  // 앱 높이 = 보이는 뷰포트(dvh). 100vh는 모바일 브라우저 탭에서 주소창만큼 길어 하단 탭이 화면 밖으로 밀리고,
  // 샘플 배너도 이 열 안에 둬야 배너 높이만큼 하단 탭이 잘리지 않는다.
  return <QueryClientProvider client={qc}><PlannerProvider><div className="flex flex-col h-screen supports-[height:100dvh]:h-dvh"><UpdatePrompt/><DemoBanner/><BrowserRouter><Routes>
    <Route element={<AppLayout/>}>
      <Route index element={<PlannerHome/>}/>
      <Route path="assets" element={<AssetsPage/>}/>
      <Route path="assets/:assetId" element={<AssetInspect/>}/>
      <Route path="plan" element={<LegacyPlannerRedirect/>}/>
      <Route path="analysis" element={<AnalysisEntry/>}/>
      <Route path="analysis/archive" element={<ArchivedMonthlyAnalysis/>}/>
      <Route path="advanced-analysis" element={<LegacyPlannerRedirect/>}/>
      <Route path="settings" element={<Settings/>}/>
      <Route path="settings/totals" element={<TotalsPolicyPage/>}/>
      <Route path="history" element={<Dashboard/>}/>
      <Route path="legacy-analysis" element={<LegacyAnalysis/>}/>
      <Route path="real-estate" element={<Navigate to="/assets?type=REAL_ESTATE" replace/>}/>
      <Route path="stock" element={<Navigate to="/assets?type=STOCK" replace/>}/>
      <Route path="pension" element={<Navigate to="/assets?type=PENSION" replace/>}/>
      <Route path="pension/sim" element={<Navigate to="/analysis?tab=pension-sim" replace/>}/>
      <Route path="prep" element={<Navigate to="/analysis?tab=prep" replace/>}/>
      <Route path="savings" element={<Navigate to="/assets?type=SAVINGS" replace/>}/>
      <Route path="physical" element={<Navigate to="/assets?type=ETC" replace/>}/>
      <Route path="etc" element={<Navigate to="/assets?type=ETC" replace/>}/>
      <Route path="retirement" element={<Navigate to="/analysis?tab=cashflow" replace/>}/>
      <Route path="corp-sim" element={<Navigate to="/legacy-analysis?tab=corp-sim" replace/>}/>
      <Route path="portfolio" element={<Navigate to="/analysis" replace/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Route></Routes></BrowserRouter></div></PlannerProvider></QueryClientProvider>
}
