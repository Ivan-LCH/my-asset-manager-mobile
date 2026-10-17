import { db } from './schema'

// ── 주식 계좌별 명의 ──────────────────────────────────────────
// 주식은 계좌 단위(키움증권, NH증권 등)로 명의가 결정됨 — 계좌 안 종목 공유.
const STOCK_ACCOUNT_OWNERSHIP_KEY = 'stock_account_ownership'

export async function getStockAccountOwnership(): Promise<Record<string, { husband: number; wife: number }>> {
  const row = await db.settings.get(STOCK_ACCOUNT_OWNERSHIP_KEY)
  if (!row) return {}
  try { return JSON.parse(row.value) as Record<string, { husband: number; wife: number }> }
  catch { return {} }
}

export async function saveStockAccountOwnership(map: Record<string, { husband: number; wife: number }>): Promise<void> {
  await db.settings.put({ key: STOCK_ACCOUNT_OWNERSHIP_KEY, value: JSON.stringify(map) })
}

/** 주식 계좌명 변경 — 계좌 안 모든 종목의 accountName, 연금 연동(linkedStockId),
 *  계좌별 명의(ownership) 키를 한 번에 바꾼다.
 *  newName 이 기존 다른 계좌명과 같으면 그 계좌로 병합된다(명의는 기존 new 계좌값 우선). */
export async function renameStockAccount(oldName: string, newName: string): Promise<void> {
  const old = oldName.trim()
  const next = newName.trim()
  if (!old || !next || old === next) return
  await db.transaction('rw', ['stockDetails', 'pensionDetails', 'settings'], async () => {
    // 1) 주식 종목의 accountName
    for (const s of await db.stockDetails.toArray()) {
      if (s.accountName === old) {
        s.accountName = next
        await db.stockDetails.put(s)
      }
    }
    // 2) 연금 연동(linkedStockId 에 계좌명 저장)
    for (const p of await db.pensionDetails.toArray()) {
      if (p.linkedStockId === old) {
        p.linkedStockId = next
        await db.pensionDetails.put(p)
      }
    }
    // 3) 계좌별 명의 키 이동 (병합 시 기존 new 계좌 명의 우선)
    const own = await getStockAccountOwnership()
    if (own[old]) {
      if (!own[next]) own[next] = own[old]
      delete own[old]
      await saveStockAccountOwnership(own)
    }
  })
}
