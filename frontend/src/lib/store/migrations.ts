import type { CorpSimPlan, LumpsumItem, PensionSimPlan } from '@/types'
import { db } from './schema'
import { getAllAssets } from './assets'
import { getSettings, saveSettings } from './settings'
import { PENSION_SIM_KEY, getCorpSim, getPensionSim, getRetirement, saveCorpSim, savePensionSim, saveRetirement } from './plans'
import { getStockAccountOwnership, saveStockAccountOwnership } from './stockAccounts'

// 일회성 마이그레이션·백필. 현재 앱에서 호출하지 않는다(외부 import 0건, backfillGaps 는 내부 호출도 없음).
// 삭제 여부는 별도 결정까지 보관하며, 공개 API(@/lib/db)도 분리 전 그대로 유지한다.

/**
 * 이력 빈 날짜 백필 — 마지막 기록일과 새 기록일 사이의 빈 날짜를
 * 직전 기록값으로 채운다. 갭이 31일 이하일 때만 (한 달 이상 비면 임의 생성 안 함).
 * 호출부의 transaction 안에서 실행해야 원자성이 보장된다.
 */
const MAX_BACKFILL_DAYS = 31

async function backfillGaps(assetId: string, newDate: string): Promise<number> {
  const rows = await db.assetHistory.where('assetId').equals(assetId).toArray()
  const prev = rows
    .filter((r) => r.date < newDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!prev) return 0

  const start = new Date(prev.date + 'T00:00:00')
  const end   = new Date(newDate + 'T00:00:00')
  const gapDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (gapDays <= 1 || gapDays > MAX_BACKFILL_DAYS) return 0

  const have = new Set(rows.map((r) => r.date))
  const fmt  = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const fills: { assetId: string; date: string; value: number | null; price: number | null; quantity: number | null }[] = []
  for (let i = 1; i < gapDays; i++) {
    const dt = new Date(start)
    dt.setDate(dt.getDate() + i)
    const ds = fmt(dt)
    if (have.has(ds)) continue
    fills.push({
      assetId,
      date:     ds,
      value:    prev.value ?? null,
      price:    prev.price ?? null,
      quantity: prev.quantity ?? null,
    })
  }
  if (fills.length > 0) await db.assetHistory.bulkAdd(fills)
  return fills.length
}

/** 마이그레이션: 기존 STOCK 자산들의 ownership을 계좌별 첫 값으로 옮김 (1회). */
export async function migrateStockOwnershipToAccount(): Promise<void> {
  const current = await getStockAccountOwnership()
  if (Object.keys(current).length > 0) return  // 이미 마이그레이션됨
  const all = await getAllAssets()
  const next: Record<string, { husband: number; wife: number }> = {}
  for (const a of all) {
    if (a.type !== 'STOCK' || !a.detail) continue
    const acct = (a.detail as { accountName?: string }).accountName
    if (!acct || next[acct]) continue
    next[acct] = a.ownership ?? { husband: 50, wife: 50 }
  }
  if (Object.keys(next).length > 0) await saveStockAccountOwnership(next)
}

/** 마이그레이션: 개인투자시뮬 inflows → 은퇴계획 lumpsum(단일 소스) + 시뮬 allocations로 되돌림 (1회).
 *  목돈 입력은 은퇴계획, 시뮬은 그 목돈을 분배만. destination=irp→irpAmount, stock→stockAmount,
 *  corp→lumpsumCorp(법인시뮬), cash→분배없음(전액 현금). */
export async function migrateInflowsToLumpsumAndAllocations(): Promise<boolean> {
  const s = await getSettings()
  if ((s as Record<string, unknown>).inflowsToLumpsumMigrated) return false
  const row = await db.settings.get(PENSION_SIM_KEY)
  const parsed = row ? (JSON.parse(row.value) as Record<string, unknown>) : null
  const inflows = Array.isArray(parsed?.inflows) ? (parsed!.inflows as Array<Record<string, unknown>>) : []

  const ret = await getRetirement()
  const existingLumpsum = [...((ret as { lumpsum?: LumpsumItem[] }).lumpsum ?? [])]
  const sim = await getPensionSim()
  const base = (sim ?? {}) as Partial<PensionSimPlan>
  const corp = await getCorpSim()

  const newLumpsum: LumpsumItem[] = []
  const newAllocations: PensionSimPlan['allocations'] = [...(base.allocations ?? [])]
  const newLumpsumCorp = [...((corp as { lumpsumCorp?: { lumpsumId: string; corpAmount: number }[] } | null)?.lumpsumCorp ?? [])]

  for (const inf of inflows) {
    const id = (inf.id as string) ?? `mig-${Math.random().toString(36).slice(2, 8)}`
    const name = (inf.name as string) ?? '목돈'
    const amount = Number(inf.amount) || 0
    const year = Number(inf.year) || new Date().getFullYear()
    const dest = inf.destination as string
    newLumpsum.push({
      id, name, amount, receiveYear: year,
      taxKind: (inf.taxKind as LumpsumItem['taxKind']) ?? 'other',
    })
    if (dest === 'irp') newAllocations.push({ lumpsumId: id, irpAmount: amount, stockAmount: 0 })
    else if (dest === 'stock') newAllocations.push({ lumpsumId: id, irpAmount: 0, stockAmount: amount })
    else if (dest === 'corp') newLumpsumCorp.push({ lumpsumId: id, corpAmount: amount })
  }

  await saveRetirement({ ...ret, lumpsum: [...existingLumpsum, ...newLumpsum] })
  await savePensionSim({ ...base, allocations: newAllocations } as PensionSimPlan)
  if (corp) await saveCorpSim({ ...corp, lumpsumCorp: newLumpsumCorp } as CorpSimPlan)

  if (parsed) {
    delete parsed.inflows
    await db.settings.put({ key: PENSION_SIM_KEY, value: JSON.stringify(parsed) })
  }
  await saveSettings({ inflowsToLumpsumMigrated: '1' })
  return inflows.length > 0
}

/** 마이그레이션(1회): 기존 이력의 빈 날짜를 직전 기록값으로 소급 백필.
 *  과거에는 시세를 가끔씩만 갱신해 6/18→7/26→8/23처럼 드문드문 남은 경우
 *  차트는 ffill으로 이어지지만 이력 데이터는 비어 있어 '연속 보기'가 끊긴다.
 *  첫~마지막 기록 사이의 모든 빈 날짜를 이전 행의 value/price/quantity로 채운다. */
export async function migrateBackfillHistory(): Promise<boolean> {
  const s = await getSettings()
  if ((s as Record<string, unknown>).historyBackfillMigrated) return false
  await saveSettings({ historyBackfillMigrated: '1' })
  return backfillAllHistoryGaps()
}

/** 전 자산의 이력에서 첫~마지막 기록 사이 모든 빈 날짜를 직전값으로 소급 채움 (갭 길이 무제한) */
async function backfillAllHistoryGaps(): Promise<boolean> {
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const all = await db.assets.toArray()
  let added = 0
  for (const a of all) {
    const rows = (await db.assetHistory.where('assetId').equals(a.id).toArray())
      .sort((x, y) => x.date.localeCompare(y.date))
    if (rows.length < 2) continue

    const have = new Set(rows.map((r) => r.date))
    const fills: { assetId: string; date: string; value: number | null; price: number | null; quantity: number | null }[] = []
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const start = new Date(prev.date + 'T00:00:00')
      const end   = new Date(rows[i].date + 'T00:00:00')
      const gapDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
      for (let k = 1; k < gapDays; k++) {
        const dt = new Date(start)
        dt.setDate(dt.getDate() + k)
        const ds = fmt(dt)
        if (have.has(ds)) continue
        fills.push({
          assetId: a.id, date: ds,
          value: prev.value ?? null, price: prev.price ?? null, quantity: prev.quantity ?? null,
        })
      }
    }
    if (fills.length > 0) {
      await db.assetHistory.bulkAdd(fills)
      added += fills.length
    }
  }
  return added > 0
}

/** 마이그레이션: 구 currentAge/retirementAge(나이) → 생년월(YYYY.MM)+은퇴예정연도(연도).
 *  구 나이 설정이 저장된 경우만 실행(기존 나이에서 역산 — 연령 보존).
 *  신규 사용자는 생년월을 비워둠(설정에서 입력). birthWife는 설정하지 않음(미혼 기본 — 설정에서 입력). */
export async function migrateSettingsToBirth(): Promise<void> {
  const s = await getSettings()
  if (s.birthHusband) return  // 이미 설정됨
  if (s.currentAge == null && s.retirementAge == null && s.retirementYear == null) return  // 신규 사용자 — 변환할 구 데이터 없음
  const currentAge = s.currentAge ?? 40
  const retirementAge = s.retirementAge ?? 65
  const now = new Date().getFullYear()
  await saveSettings({
    birthHusband: `${now - currentAge}.01`,
    retirementYear: s.retirementYear ?? (now + Math.max(0, retirementAge - currentAge)),
  })
}
