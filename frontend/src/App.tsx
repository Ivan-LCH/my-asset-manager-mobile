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
import { PlannerHome, PlanPage, PlannerAnalysis, AssetInspect } from '@/planner/pages'

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
function AnalysisEntry() { const [params]=useSearchParams(); return params.has('run')?<PlannerAnalysis/>:<AnalysisPage/> }
export default function App() {
  return <QueryClientProvider client={qc}><PlannerProvider><UpdatePrompt/><DemoBanner/><BrowserRouter><Routes>
    <Route element={<AppLayout/>}>
      <Route index element={<PlannerHome/>}/>
      <Route path="assets" element={<AssetsPage/>}/>
      <Route path="assets/:assetId" element={<AssetInspect/>}/>
      <Route path="plan" element={<PlanPage/>}/>
      <Route path="analysis" element={<AnalysisEntry/>}/>
      <Route path="advanced-analysis" element={<PlannerAnalysis/>}/>
      <Route path="settings" element={<Settings/>}/>
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
    </Route></Routes></BrowserRouter></PlannerProvider></QueryClientProvider>
}
