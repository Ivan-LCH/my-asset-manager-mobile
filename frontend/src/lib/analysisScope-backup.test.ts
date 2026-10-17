// 4단계 1 후속 — 실데이터 백업(2026-10-14-fixed) 회귀: 은퇴 분석(useAnalysisEngine)에 합산 기준 적용. 파일이 없으면 skip.
// 데이터 훅만 mock 하고 엔진 본체는 실제 코드를 그대로 호출한다 (훅 안에 React state hook 없음).
// 정책은 합산 기준 화면과 같은 savePlan → loadContext 경로로 저장·적용한다. 날짜는 수치 고정을 위해 2026-10-17로 둔다.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
const state: any = {}
vi.mock('@/hooks/useAssets', () => ({ useAssets: () => ({ data: state.assets, isPending: false }) }))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ data: state.settings, isPending: false }) }))
vi.mock('@/hooks/useDividends', () => ({ useDividendSummary: () => ({ data: state.div, isPending: false }) }))
vi.mock('@/hooks/useCorpSim', () => ({ useCorpSim: () => ({ data: state.corp, isPending: false }) }))
vi.mock('@/hooks/usePensionSim', () => ({ usePensionSim: () => ({ data: state.psim, isPending: false }) }))
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => ({ data: state.portfolio, isPending: false }) }))
vi.mock('@/hooks/useStockAccountOwnership', () => ({ useStockAccountOwnership: () => ({ data: state.owners, isPending: false }) }))
vi.mock('@/planner/context', () => ({ usePlanner: () => ({ data: state.planner, error: null }) }))
import { db, importBackup, getAllAssets, getSettings, getPensionSim, getCorpSim, getPortfolio, getStockAccountOwnership, getDividendSummary, getRetirement } from '@/lib/db'
import { useAnalysisEngine } from '@/hooks/useAnalysisEngine'
import { retirementInputs } from '@/lib/analysisInputs'
import { policySchema } from '@/planner/model'
import { loadContext, savePlan } from '@/planner/storage'
import type { Asset, RetirementPlan } from '@/types'

const { existsSync, readFileSync } = (await import('node:fs' as string)) as {
  existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string
}
const BACKUP = '/workspace/asset-analysis/asset-manager-backup-2026-10-14-fixed.json'
const man = (v: number | undefined) => Math.round((v ?? NaN) / 1e4)

let assets: Asset[] = [], plan: RetirementPlan
/** 저장 정책 없이(=합산 기준 적용 전 코드와 같은 입력) 또는 policies 를 저장한 뒤 엔진 실행 */
async function run(policies?: { name: string; role: string }[]) {
  if (!policies) state.planner = null
  else {
    const ctx = await loadContext()
    await savePlan({ ...ctx.plan, policies: policies.map(p => policySchema.parse({ assetId: assets.find(a => a.name === p.name)!.id, role: p.role })) }, ctx.plan.revision)
    state.planner = await loadContext()
  }
  const e = useAnalysisEngine(plan)
  return { e, ry: e.retirementYear, rr: e.retirementRow!, final: man(e.cashFlow[e.cashFlow.length - 1].cumulative), y2040: man(e.cashFlow.find(r => r.year === 2040)!.totalIncome) }
}

describe.skipIf(!existsSync(BACKUP))('실데이터 — 은퇴 분석에 합산 기준 적용', () => {
  let before: Awaited<ReturnType<typeof run>>
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T12:00:00+09:00') })
    await Promise.all(db.tables.map(t => t.clear()))
    await importBackup(JSON.parse(readFileSync(BACKUP, 'utf8').replace(/^﻿/, '')))
    assets = await getAllAssets()
    const settings = await getSettings()
    Object.assign(state, { assets, settings, div: await getDividendSummary(), corp: await getCorpSim(), psim: await getPensionSim(),
      portfolio: (await getPortfolio()) ?? { dividendYield: 0, growthRate: 0 }, owners: await getStockAccountOwnership() })
    plan = retirementInputs(await getRetirement(), settings).plan
    before = await run()
  }, 60000)
  afterAll(() => { vi.useRealTimers() })

  it('기본 정책(저장 정책 없음): 적용 전과 결과가 같다 — 최종 누적 776,572만', async () => {
    expect(before.final).toBe(776_572)
    const after = await run([])
    expect(after.e.isLoading).toBe(false)
    expect(after.e.cashFlow).toEqual(before.e.cashFlow)
    expect(after.e.projection.rows).toEqual(before.e.projection.rows)
    expect(after.e.analysisNotes).toEqual(before.e.analysisNotes)
  })

  it('planner 스냅샷이 아직 없으면 로딩 중으로 본다', () => {
    expect(before.e.isLoading).toBe(true)
  })

  it('개인연금-삼성화재 제외: 지급까지 빠져 최종 누적 748,732만, 연결 자산 경고·incomplete 없음', async () => {
    const r = await run([{ name: '이창호-개인연금-삼성화재', role: 'excluded' }])
    expect(r.final).toBe(748_732)
    expect(man(r.rr.totalIncome)).toBe(576)
    expect(r.y2040).toBe(1_459)
    expect(r.e.analysisNotes.some(n => n.includes('연결 자산 확인 필요'))).toBe(false)
    expect(r.e.projection.incomplete).toBe(before.e.projection.incomplete)
    expect(r.e.pensionSimPlan!.sources.some(s => s.name === '이창호-개인연금-삼성화재')).toBe(false)
    expect(r.e.analysisNotes.some(n => n.includes('이창호-개인연금-삼성화재 합산 제외'))).toBe(true)
  })

  it('이창호-국민연금 제외: 지급 유지 — 2040 월수입 1,575만, 최종 누적 776,572만', async () => {
    const r = await run([{ name: '이창호-국민연금', role: 'excluded' }])
    expect(r.y2040).toBe(1_575)
    expect(r.final).toBe(776_572)
    expect(r.e.cashFlow).toEqual(before.e.cashFlow)
    expect(r.e.analysisNotes.some(n => n.startsWith('이창호-국민연금: ') && n.includes('연금 지급은 그대로 반영'))).toBe(true)
  })

  it('곡반정동하늘채 제외: 보유세·건보 그대로 (638만/50만)', async () => {
    const r = await run([{ name: '곡반정동하늘채', role: 'excluded' }])
    expect(man(r.rr.holdingTaxAnnual)).toBe(638)
    expect(man(r.e.autoHoldingTaxByYear.get(r.ry))).toBe(638)
    expect(man(r.e.healthByYear.get(r.ry))).toBe(50)
    expect(r.e.cashFlow).toEqual(before.e.cashFlow)
    expect(r.e.analysisNotes.some(n => n.startsWith('곡반정동하늘채: ') && n.includes('보유세·건강보험 재산 산정에는 포함'))).toBe(true)
  })

  it('퇴직IRP 래퍼 제외: 무시(결과 불변)하고 계좌 종목 제외 안내', async () => {
    const r = await run([{ name: '이창호-퇴직IRP-미래에셋', role: 'excluded' }])
    expect(r.e.cashFlow).toEqual(before.e.cashFlow)
    expect(r.final).toBe(776_572)
    expect(r.e.analysisNotes.some(n => n.startsWith('이창호-퇴직IRP-미래에셋 → ') && n.includes('계좌의 종목을 제외하세요'))).toBe(true)
  })
})
