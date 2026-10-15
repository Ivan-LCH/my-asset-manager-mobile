// 자산 입력 검증 (순수 함수) — AssetForm / AssetCreateForm / HistoryTable / previewBackup 공용.
// errors: 폼 저장 차단. warnings: 확인 후 진행 가능. 백업 가져오기는 둘 다 막지 않고 경고 목록으로만 표시한다.
// 처분일(매각일)은 미래 날짜 허용 — buildSnapshot 이 미래 처분일을 FUTURE_SALE 로 지원하기 때문.

export const MIN_DATE = '1900-01-01'

/** Asia/Seoul 기준 오늘 YYYY-MM-DD (planner/model.ts today() 와 같은 기준) */
export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** 빈 값은 통과(null). 형식·실존 날짜·1900-01-01 하한·(allowFuture 아니면) 오늘 상한을 검사해 오류 문구 반환 */
export function dateError(
  value: string | null | undefined,
  today: string,
  { label = '날짜', allowFuture = false }: { label?: string; allowFuture?: boolean } = {},
): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return `${label}: 형식이 올바르지 않습니다 (${value})`
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(2000, mo - 1, d))
  dt.setUTCFullYear(y)   // Date.UTC 는 0~99년을 19xx 로 바꾸므로 연도를 따로 지정
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return `${label}: 존재하지 않는 날짜입니다 (${value})`
  if (value < MIN_DATE) return `${label}: ${MIN_DATE} 이전 날짜입니다 (${value}) — 연도를 4자리로 입력하세요`
  if (!allowFuture && value > today) return `${label}: 오늘(${today}) 이후 날짜입니다 (${value})`
  return null
}

export interface AssetCheckInput {
  id?: string
  type: string
  name: string
  acquisitionDate?: string | null
  disposalDate?: string | null
  quantity?: number | null
  currentValue?: number | null
  accountName?: string | null
  ticker?: string | null
  /** 국민연금 등 수급권(entitlement) — 잔액 0이 정상 */
  entitlement?: boolean
  /** linkedStockId / linkedTo 연결 항목 — 잔액은 연결 계좌에 있으므로 0이 정상 */
  linked?: boolean
}
export interface AssetCheckResult { errors: string[]; warnings: string[] }

/** planner defaultPolicy 와 같은 기준의 국민연금 판정 */
export const isNationalPension = (type: string, pensionType?: string | null) =>
  type === 'PENSION' && /national|국민/.test((pensionType ?? '').toLowerCase())

/** 저장된 Asset → 검증 입력 */
export function toCheckInput(a: {
  id: string; type: string; name: string; acquisitionDate?: string | null; disposalDate?: string | null
  quantity?: number | null; currentValue?: number | null; detail?: unknown
}): AssetCheckInput {
  const d = a.detail as { accountName?: string; ticker?: string; pensionType?: string; linkedStockId?: string } | undefined
  return {
    id: a.id, type: a.type, name: a.name, acquisitionDate: a.acquisitionDate, disposalDate: a.disposalDate,
    quantity: a.quantity, currentValue: a.currentValue, accountName: d?.accountName, ticker: d?.ticker,
    entitlement: isNationalPension(a.type, d?.pensionType), linked: !!d?.linkedStockId,
  }
}

const norm = (v?: string | null) => (v ?? '').trim().toUpperCase()
/** planner/accounts.ts accountName() 과 같은 계좌 키 (trim, 빈 값은 '미분류') */
const accountKey = (v?: string | null) => (v ?? '').trim() || '미분류'
/** 티커가 있으면 티커, 없으면 이름으로 비교 */
const holdingKey = (i: AssetCheckInput) => norm(i.ticker) ? 't:' + norm(i.ticker) : 'n:' + norm(i.name)

/** 같은 계좌 + 같은 티커(티커 없으면 같은 이름)인 다른 보유 주식(처분일 없음) */
export function findDuplicateStock(input: AssetCheckInput, others: AssetCheckInput[]): AssetCheckInput | undefined {
  if (input.type !== 'STOCK' || input.disposalDate || !norm(input.ticker || input.name)) return undefined
  return others.find(o => o.id !== input.id && o.type === 'STOCK' && !o.disposalDate
    && accountKey(o.accountName) === accountKey(input.accountName) && holdingKey(o) === holdingKey(input))
}

/** 폼 저장 차단 오류: 취득일 1900~오늘, 매각일 1900 하한(미래 허용), 매각일 < 취득일 */
export function assetDateErrors(input: AssetCheckInput, today: string): string[] {
  const errors: string[] = []
  const acq = dateError(input.acquisitionDate, today, { label: '취득일' })
  const disp = dateError(input.disposalDate, today, { label: '매각일', allowFuture: true })
  if (acq) errors.push(acq)
  if (disp) errors.push(disp)
  if (!acq && !disp && input.acquisitionDate && input.disposalDate && input.disposalDate < input.acquisitionDate)
    errors.push(`매각일(${input.disposalDate})이 취득일(${input.acquisitionDate})보다 빠릅니다`)
  return errors
}

/** 저장은 허용하는 경고: 수량·평가액 0 미처분(수급권·연결 항목 제외), 같은 계좌·티커 중복 */
export function assetWarnings(input: AssetCheckInput, others: AssetCheckInput[]): string[] {
  const warnings: string[] = []
  if (!input.disposalDate && !input.entitlement && !input.linked && !(input.quantity ?? 0) && !(input.currentValue ?? 0))
    warnings.push('수량·평가액이 모두 0인데 매각일이 없습니다. 매각했다면 매각일을 입력하세요.')
  const dup = findDuplicateStock(input, others)
  if (dup) {
    const what = norm(input.ticker) ? `같은 티커(${input.ticker!.trim()})` : `같은 이름(${input.name.trim()})`
    warnings.push(`같은 계좌(${accountKey(input.accountName)})에 ${what} 종목이 이미 있습니다: ${dup.name}`)
  }
  return warnings
}

export function checkAsset(input: AssetCheckInput, others: AssetCheckInput[], today: string): AssetCheckResult {
  return { errors: assetDateErrors(input, today), warnings: assetWarnings(input, others) }
}

type Row = Record<string, any>

/**
 * 백업 테이블 전체 검사 → "자산명: 문구" 경고 목록. 가져오기를 막지 않는다.
 * 백업에서는 날짜 범위 위반(취득·매각·이력)도 경고로만 표시한다.
 */
export function backupWarnings(tables: Record<string, unknown[]>, today: string): string[] {
  const byAsset = (name: string) => {
    const m = new Map<string, Row>()
    for (const r of (tables[name] ?? []) as Row[]) if (r?.assetId) m.set(r.assetId, r)
    return m
  }
  const stock = byAsset('stockDetails'), pension = byAsset('pensionDetails')
  const plan = ((tables.plannerPlans ?? []) as Row[]).find(r => r?.id === 'main')?.plan
  const policies = new Map<string, Row>(((plan?.policies ?? []) as Row[]).map(p => [p.assetId, p]))
  const badHistory = new Map<string, string[]>()
  for (const h of (tables.assetHistory ?? []) as Row[]) {
    if (!h?.assetId || dateError(h.date, today) == null) continue
    badHistory.set(h.assetId, [...(badHistory.get(h.assetId) ?? []), String(h.date)])
  }

  const rows: AssetCheckInput[] = ((tables.assets ?? []) as Row[]).map(a => {
    const p = policies.get(a.id)
    return {
      id: a.id, type: a.type, name: a.name ?? a.id, acquisitionDate: a.acquisitionDate, disposalDate: a.disposalDate,
      quantity: a.quantity, currentValue: a.currentValue,
      accountName: stock.get(a.id)?.accountName, ticker: stock.get(a.id)?.ticker,
      entitlement: p ? p.role === 'entitlement' : isNationalPension(a.type, pension.get(a.id)?.pensionType),
      linked: !!pension.get(a.id)?.linkedStockId || !!p?.linkedTo,
    }
  })
  const out: string[] = []
  rows.forEach((row, i) => {
    const msgs = [...assetDateErrors(row, today), ...assetWarnings(row, rows.slice(0, i))]   // 중복은 뒤쪽 항목에만 1회 표시
    const hist = badHistory.get(row.id!) ?? []
    if (hist.length) msgs.push(`이력 날짜 ${hist.length}건이 ${MIN_DATE}~${today} 범위 밖입니다 (${hist.slice(0, 3).join(', ')}${hist.length > 3 ? ' …' : ''})`)
    for (const msg of msgs) out.push(`${row.name}: ${msg}`)
  })
  return out
}
