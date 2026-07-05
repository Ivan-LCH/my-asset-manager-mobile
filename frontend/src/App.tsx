import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import RealEstatePage from '@/pages/RealEstatePage'
import AssetPage from '@/pages/AssetPage'
import StockPage from '@/pages/StockPage'
import PensionPage from '@/pages/PensionPage'
import RetirementPage from '@/pages/RetirementPage'
import CorpSimPage from '@/pages/CorpSimPage'
import Settings from '@/pages/Settings'
import { getAllAssets, getSettings, saveSettings, seedSampleData } from '@/lib/db'

const qc = new QueryClient()

/** 최초 실행(빈 DB) 시 샘플 데이터 1회 시드 */
function Bootstrap() {
  const c = useQueryClient()
  useEffect(() => {
    void (async () => {
      try {
        const all = await getAllAssets()
        const s = await getSettings()
        const seeded = (s as Record<string, unknown>).sampleSeeded
        if (all.length === 0 && !seeded) {
          await seedSampleData()
          await saveSettings({ sampleSeeded: '1' })
          c.invalidateQueries()
        }
      } catch {
        /* 무시 */
      }
    })()
  }, [c])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Bootstrap />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="real-estate" element={<RealEstatePage />} />
            <Route path="stock"       element={<StockPage />} />
            <Route path="pension"     element={<PensionPage />} />
            <Route path="savings"     element={<AssetPage type="SAVINGS" />} />
            <Route path="physical"    element={<AssetPage type="PHYSICAL" />} />
            <Route path="etc"         element={<AssetPage type="ETC" />} />
            <Route path="retirement"  element={<RetirementPage />} />
            <Route path="corp-sim"    element={<CorpSimPage />} />
            <Route path="settings"    element={<Settings />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
