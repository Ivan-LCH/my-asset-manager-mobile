// 허브 섹션별 편집 초안 — 섹션마다 따로 저장해도 서로의 값을 덮어쓰지 않게,
// 초안에는 "이 섹션에서 고친 필드"만 담고 나머지는 항상 최신 저장본을 읽는다.
// 저장 경로·키는 기존 화면과 같다 (useSaveRetirement / useSavePensionSim / useSavePortfolio).
import { useCallback, useMemo, useRef, useState } from 'react'
import { useRetirement, useSaveRetirement } from '@/hooks/useRetirement'
import { useSettings } from '@/hooks/useSettings'
import { usePensionSim, useSavePensionSim } from '@/hooks/usePensionSim'
import { usePortfolio, useSavePortfolio, DEFAULT_PORTFOLIO } from '@/hooks/usePortfolio'
import { useAssets } from '@/hooks/useAssets'
import { useDividendSummary } from '@/hooks/useDividends'
import { useStockAccountOwnership } from '@/hooks/useStockAccountOwnership'
import { retirementInputs, pensionInputs } from '@/lib/analysisInputs'
import { annualPension } from '@/lib/annualPension'
import type { PensionSimPlan, PortfolioSettings, RetirementPlan } from '@/types'

/** 고친 필드만 담는 초안 + 버전(저장 중 추가 편집은 미저장으로 유지). */
function usePatchDraft<T extends object>() {
  const [draft, setDraft] = useState<Partial<T>>({})
  const version = useRef(0)
  const update = useCallback(<K extends keyof T>(key: K, val: T[K]) => {
    setDraft((d) => ({ ...d, [key]: val }))
    version.current += 1
  }, [])
  const dirty = Object.keys(draft).length > 0
  return { draft, setDraft, version, update, dirty }
}

/** 은퇴계획(settings.retirement_plan) — 고친 키만 병합 저장 (기존 생활비·목돈·현금흐름 화면과 같은 방식). */
export function useRetirementDraft() {
  const saved = useRetirement(), settings = useSettings(), saveMut = useSaveRetirement()
  const { draft, setDraft, version, update, dirty } = usePatchDraft<RetirementPlan>()
  const base = useMemo(() => retirementInputs(saved.data, settings.data).plan, [saved.data, settings.data])
  const plan = useMemo(() => ({ ...base, ...draft }) as RetirementPlan, [base, draft])
  const save = async () => {
    if (!dirty) return
    const v = version.current
    await saveMut.mutateAsync(draft)
    if (version.current === v) setDraft({})
  }
  return { plan, update, dirty, save, saving: saveMut.isPending, error: saveMut.isError,
    ready: !saved.isPending && !settings.isPending, saved: saved.data }
}

/** 연금 시뮬 저장본(pension_sim_plan) — 최신 저장본 + 이 섹션 편집을 기존 연금 시뮬 화면과 같은 정규화(pensionInputs)로 저장. */
export function usePensionDraft() {
  const saved = usePensionSim(), assets = useAssets(), retirement = useRetirement(), saveMut = useSavePensionSim()
  const { draft, setDraft, version, update, dirty } = usePatchDraft<PensionSimPlan>()
  const retirementYear = retirement.data?.retirementYear
  const base = useMemo(() => pensionInputs(saved.data, assets.data ?? [], retirementYear), [saved.data, assets.data, retirementYear])
  const plan = useMemo(() => ({ ...base, ...draft }) as PensionSimPlan, [base, draft])
  /** 같은 이벤트에서 여러 번 고쳐도 누적되도록 현재 값 기준 함수형 갱신 */
  const modify = <K extends keyof PensionSimPlan>(key: K, fn: (cur: PensionSimPlan[K]) => PensionSimPlan[K]) => {
    setDraft((d) => ({ ...d, [key]: fn((key in d ? d[key] : base[key]) as PensionSimPlan[K]) }))
    version.current += 1
  }
  const save = async () => {
    if (!dirty) return
    const v = version.current
    await saveMut.mutateAsync(pensionInputs(plan, assets.data ?? [], retirementYear))
    if (version.current === v) setDraft({})
  }
  return { plan, update, modify, dirty, save, saving: saveMut.isPending, error: saveMut.isError,
    ready: saved.data !== undefined && !assets.isPending && !retirement.isPending, assets: assets.data ?? [] }
}

/** IRP 포트폴리오(portfolio_settings) — 배당률·상승률 */
export function usePortfolioDraft() {
  const saved = usePortfolio(), saveMut = useSavePortfolio()
  const { draft, setDraft, version, dirty } = usePatchDraft<PortfolioSettings>()
  const value = { ...DEFAULT_PORTFOLIO, ...saved.data, ...draft }
  const patch = (p: Partial<PortfolioSettings>) => { setDraft((d) => ({ ...d, ...p })); version.current += 1 }
  const save = async () => {
    if (!dirty) return
    const v = version.current
    await saveMut.mutateAsync(value)
    if (version.current === v) setDraft({})
  }
  return { value, patch, dirty, save, saving: saveMut.isPending, error: saveMut.isError, ready: !saved.isPending }
}

/** 연금 시뮬 화면과 같은 연금 원장 투영 — 입력 화면의 참고 표시(연결 계좌·세금 추가정보 원천)용. */
export function usePensionProjection(plan: PensionSimPlan, lumpsums: RetirementPlan['lumpsum']) {
  const assets = useAssets(), retirement = useRetirement(), portfolio = usePortfolio()
  const dividends = useDividendSummary(), owners = useStockAccountOwnership()
  const effectivePlan = pensionInputs(plan, assets.data ?? [], retirement.data?.retirementYear)
  const projection = annualPension(effectivePlan, assets.data ?? [], new Date().getFullYear(),
    Math.max(effectivePlan.refYear, effectivePlan.startYear + Math.max(1, effectivePlan.withdrawalYears) - 1, ...(effectivePlan.monthlyPlan?.accounts.map(a => Number(a.end?.slice(0, 4) ?? 0)) ?? [])),
    { simulation: true, growth: portfolio.data?.growthRate ?? 0, dividend: portfolio.data?.dividendYield ?? 0, lumpsums,
      stockLink: { dividends: dividends.data?.items, owners: owners.data } })
  return { effectivePlan, projection, linkPending: dividends.isPending || owners.isPending, linkError: !!(dividends.error || owners.error) }
}
