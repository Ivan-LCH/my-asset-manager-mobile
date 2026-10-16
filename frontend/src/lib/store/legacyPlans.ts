// 저장된 계획 JSON(settings)의 옛 형태를 현재 형태로 바꾸는 읽기 시 변환.
// 4단계에서 getPensionSim/getPortfolio 본문을 그대로 옮긴 것 — 입력 객체를 제자리에서 고치고 같은 객체를 돌려준다.
// 예외는 호출부(getPensionSim/getPortfolio)의 try 안에서 처리되어 null 이 된다(기존과 동일).

/** pension_sim_plan 레거시 변환 (parsed 를 직접 수정) */
export function upgradePensionSimPlan(parsed: Record<string, unknown>): Record<string, unknown> {
  // 마이그레이션: 구 stockBalance/stockDividendYield → holdings/yields/ownership
  const legacy = parsed as { stockBalance?: number; stockDividendYield?: number; stockHoldings?: unknown }
  if (legacy.stockBalance !== undefined && legacy.stockHoldings === undefined) {
    parsed.stockHoldings = []
    parsed.stockYields = []
    parsed.stockOwnership = { husband: 50, wife: 50 }
    delete (parsed as { stockBalance?: number }).stockBalance
    delete (parsed as { stockDividendYield?: number }).stockDividendYield
  }
  // 마이그레이션: 종목 기반(stockHoldings/stockYields/stockGrowthRate) → 계좌 단위 stockAccount(남편/와이프)
  // 종목별 가중평균 배당률·상승률을 계좌 기본값으로 승계. extraAmount=0.
  const legacyHoldings = parsed as {
    stockHoldings?: { ticker?: string; weight?: number; growthRate?: number }[]
    stockYields?: { ticker?: string; yield?: number; manual?: boolean }[]
    stockGrowthRate?: number; stockManualYield?: number; stockAccount?: unknown
  }
  if (legacyHoldings.stockHoldings !== undefined && legacyHoldings.stockAccount === undefined) {
    const holdings = legacyHoldings.stockHoldings ?? []
    const yields = legacyHoldings.stockYields ?? []
    // 가중평균 배당률 (수동 입력 우선) — blendedYield 인라인 (db.ts는 corpSim import 회피)
    const yieldByTicker = new Map<string, number>()
    for (const y of yields) if (y.ticker && typeof y.yield === 'number') yieldByTicker.set(y.ticker, y.yield)
    const wHoldings = holdings.filter((h) => h.ticker && (h.weight ?? 0) > 0)
    const totalW = wHoldings.reduce((s, h) => s + (h.weight ?? 0), 0)
    let blendedY = 0
    if (totalW > 0) {
      blendedY = wHoldings.reduce((s, h) => s + (yieldByTicker.get(h.ticker as string) ?? 0) * ((h.weight ?? 0) / totalW), 0)
    }
    // 가중평균 상승률
    const gHoldings = holdings.filter((h) => h.ticker && (h.weight ?? 0) > 0 && (h.growthRate ?? 0) > 0)
    const gW = gHoldings.reduce((s, h) => s + (h.weight ?? 0), 0)
    const blendedG = gW > 0 ? gHoldings.reduce((s, h) => s + (h.growthRate ?? 0) * ((h.weight ?? 0) / gW), 0) : 0
    const yieldVal = blendedY > 0 ? blendedY : (legacyHoldings.stockManualYield ?? 4)
    const growthVal = blendedG > 0 ? blendedG : (legacyHoldings.stockGrowthRate ?? 5)
    parsed.stockAccount = {
      husband: { extraAmount: 0, dividendYield: yieldVal, growthRate: growthVal },
      wife:    { extraAmount: 0, dividendYield: yieldVal, growthRate: growthVal },
    }
    delete (parsed as { stockHoldings?: unknown }).stockHoldings
    delete (parsed as { stockYields?: unknown }).stockYields
    delete (parsed as { stockGrowthRate?: unknown }).stockGrowthRate
    delete (parsed as { stockManualYield?: unknown }).stockManualYield
  }
  // 마이그레이션: 구 comprehensiveDeduction → spouseDependent/dependents/useStandardDeduction
  const legacyDed = parsed as { comprehensiveDeduction?: number; spouseDependent?: boolean; useStandardDeduction?: boolean }
  if (typeof legacyDed.comprehensiveDeduction === 'number' && legacyDed.spouseDependent === undefined) {
    parsed.spouseDependent = true
    parsed.dependents = (parsed.dependents as number) ?? 0
    parsed.useStandardDeduction = true
    delete (parsed as { comprehensiveDeduction?: number }).comprehensiveDeduction
  }
  // 구 inflows(PensionInflowItem)는 migrateInflowsToLumpsumAndAllocations에서 목돈+분배로 이전됨.
  if (parsed.allocations === undefined) parsed.allocations = []
  return parsed
}

/** portfolio_settings 레거시 변환 (parsed 를 직접 수정) */
export function upgradePortfolio(parsed: Record<string, unknown>): Record<string, unknown> {
  // 마이그레이션: 종목 기반(holdings/blendedYield/manualYields) → 단순 배당률·상승률
  const legacy = parsed as {
    holdings?: { ticker?: string; weight?: number; growthRate?: number }[]
    blendedYield?: number; manualYields?: { ticker?: string; yield?: number }[]
    dividendYield?: number; growthRate?: number
  }
  if (legacy.holdings !== undefined && legacy.dividendYield === undefined) {
    // 배당률: 저장된 blendedYield 우선, 없으면 manualYields 평균
    let dy = typeof legacy.blendedYield === 'number' ? legacy.blendedYield : 0
    if (dy <= 0 && legacy.manualYields && legacy.manualYields.length > 0) {
      dy = legacy.manualYields.reduce((s, m) => s + (m.yield ?? 0), 0) / legacy.manualYields.length
    }
    // 상승률: holdings growthRate 가중평균
    const holdings = legacy.holdings ?? []
    const gH = holdings.filter((h) => (h.weight ?? 0) > 0 && Number.isFinite(h.growthRate))
    const gW = gH.reduce((s, h) => s + (h.weight ?? 0), 0)
    const gr = gW > 0 ? gH.reduce((s, h) => s + (h.growthRate ?? 0) * ((h.weight ?? 0) / gW), 0) : 0
    parsed.dividendYield = Math.max(0,dy)
    parsed.growthRate = gr
    delete (parsed as { holdings?: unknown }).holdings
    delete (parsed as { blendedYield?: unknown }).blendedYield
    delete (parsed as { manualYields?: unknown }).manualYields
  }
  return parsed
}
