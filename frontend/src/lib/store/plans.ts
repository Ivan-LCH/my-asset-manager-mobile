import type { CorpSimPlan, PensionSimPlan, PortfolioSettings, RetirementPlan } from '@/types'
import { db } from './schema'
import { upgradePensionSimPlan, upgradePortfolio } from './legacyPlans'

// settings 키 상수는 store 내부 공유용으로 export 한다(migrations 가 PENSION_SIM_KEY 사용).
// lib/db.ts 에서는 재노출하지 않는다 — 분리 전처럼 공개 API 밖.

// ──────────────────────────────────────────────────────────────
// Retirement — 원본 api/retirement.py (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
export const RETIREMENT_KEY = 'retirement_plan'

export async function getRetirement(): Promise<RetirementPlan> {
  const row = await db.settings.get(RETIREMENT_KEY)
  if (!row) return {} as RetirementPlan
  try {
    return JSON.parse(row.value) as RetirementPlan
  } catch {
    return {} as RetirementPlan
  }
}

export async function saveRetirement(data: Partial<RetirementPlan>): Promise<void> {
  // 화면에서 편집한 필드만 최신 저장본에 병합한다. 읽기와 쓰기를 하나의
  // 트랜잭션으로 묶어 다른 섹션의 설정이 오래된 폼 값으로 사라지지 않게 한다.
  await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get(RETIREMENT_KEY)
    const previous = row ? JSON.parse(row.value) as Partial<RetirementPlan> : {}
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
      throw new Error('저장된 은퇴계획을 읽을 수 없습니다. 원본을 백업한 뒤 확인해 주세요.')
    }
    // 키 생략은 보존, 명시적 undefined는 해당 선택값 삭제로 구분한다.
    await db.settings.put({ key: RETIREMENT_KEY, value: JSON.stringify({ ...previous, ...data }) })
  })
}

// ──────────────────────────────────────────────────────────────
// 투자법인 시뮬레이터 (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
export const CORP_SIM_KEY = 'corp_sim_plan'

export async function getCorpSim(): Promise<CorpSimPlan | null> {
  const row = await db.settings.get(CORP_SIM_KEY)
  if (!row) return null
  try {
    return JSON.parse(row.value) as CorpSimPlan
  } catch {
    return null
  }
}

export async function saveCorpSim(data: CorpSimPlan): Promise<void> {
  await db.settings.put({ key: CORP_SIM_KEY, value: JSON.stringify(data) })
}

// ──────────────────────────────────────────────────────────────
// 연금 시뮬레이터 (settings 에 JSON 직렬화)
// ──────────────────────────────────────────────────────────────
export const PENSION_SIM_KEY = 'pension_sim_plan'

export async function getPensionSim(): Promise<PensionSimPlan | null> {
  const row = await db.settings.get(PENSION_SIM_KEY)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    return upgradePensionSimPlan(parsed) as unknown as PensionSimPlan
  } catch {
    return null
  }
}

export async function savePensionSim(data: PensionSimPlan): Promise<void> {
  await db.settings.put({ key: PENSION_SIM_KEY, value: JSON.stringify(data) })
}

// ──────────────────────────────────────────────────────────────
// 공통 투자 포트폴리오 (법인·연금 시뮬 공유)
// ──────────────────────────────────────────────────────────────
export const PORTFOLIO_KEY = 'portfolio_settings'

export async function getPortfolio(): Promise<PortfolioSettings | null> {
  const row = await db.settings.get(PORTFOLIO_KEY)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    return upgradePortfolio(parsed) as unknown as PortfolioSettings
  } catch {
    return null
  }
}

export async function savePortfolio(data: PortfolioSettings): Promise<void> {
  await db.settings.put({ key: PORTFOLIO_KEY, value: JSON.stringify(data) })
}
