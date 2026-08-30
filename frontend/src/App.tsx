import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/pages/Dashboard'
import AssetsPage from '@/pages/AssetsPage'
import AnalysisPage from '@/pages/AnalysisPage'
import Settings from '@/pages/Settings'
import { getAllAssets, getSettings, saveSettings, seedSampleData, migrateStockOwnershipToAccount, migrateInflowsToLumpsumAndAllocations, migrateSettingsToBirth, migrateWifeNationalPension } from '@/lib/db'

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
        // 주식 계좌 명의 마이그레이션 (구 종목별 ownership → 계좌별)
        await migrateStockOwnershipToAccount()
        c.invalidateQueries({ queryKey: ['stock_account_ownership'] })
        // 설정 나이 → 생년월/은퇴연도 변환 + 와이프 국민연금 자산 생성
        await migrateSettingsToBirth()
        await migrateWifeNationalPension()
        // 시뮬 inflows → 은퇴계획 목돈 + 시뮬 allocations로 되돌림 (목돈 단일 소스화)
        const migrated = await migrateInflowsToLumpsumAndAllocations()
        if (migrated) {
          c.invalidateQueries({ queryKey: ['pension-sim'] })
          c.invalidateQueries({ queryKey: ['retirement'] })
        }
        c.invalidateQueries()
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
            {/* 간소화된 4-tab 구조 */}
            <Route path="assets"   element={<AssetsPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
            <Route path="settings" element={<Settings />} />
            {/* 기존 라우트 호환 — 통합 페이지의 해당 칩/탭으로 리다이렉트 */}
            <Route path="real-estate" element={<Navigate to="/assets?type=REAL_ESTATE" replace />} />
            <Route path="stock"       element={<Navigate to="/assets?type=STOCK" replace />} />
            <Route path="pension"     element={<Navigate to="/assets?type=PENSION" replace />} />
            <Route path="pension/sim" element={<Navigate to="/analysis?tab=pension-sim" replace />} />
            <Route path="prep"        element={<Navigate to="/analysis?tab=prep" replace />} />
            <Route path="savings"     element={<Navigate to="/assets?type=SAVINGS" replace />} />
            <Route path="physical"    element={<Navigate to="/assets?type=PHYSICAL" replace />} />
            <Route path="etc"         element={<Navigate to="/assets?type=ETC" replace />} />
            <Route path="retirement"  element={<Navigate to="/analysis?tab=cashflow" replace />} />
            <Route path="corp-sim"    element={<Navigate to="/analysis?tab=corp-sim" replace />} />
            <Route path="portfolio"   element={<Navigate to="/analysis" replace />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
