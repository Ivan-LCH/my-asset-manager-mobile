// 환율 자동 갱신 — 시세와 같은 /api/price 프록시로 Yahoo 환율 티커 조회.
// USD→KRW: KRW=X, JPY→KRW: JPYKRW=X (meta.regularMarketPrice).
// 값은 settings(exchange_rate_<통화>, 백업 포함)에, 범위 밖 대기값은 localStorage(기기별)에 둔다.
import { db, FALLBACK_RATES, saveSettings } from './db'
import { fetchStockQuote, quoteErrorLabel, type QuoteResult } from './stockPrice'

export const FX_TICKERS: Record<string, string> = { USD: 'KRW=X', JPY: 'JPYKRW=X' }
/** 저장값 대비 허용 변동 폭. 넘으면 2회 연속 같은 수준이 관측돼야 반영한다. */
export const FX_TOLERANCE = 0.15
const PENDING_KEY = (c: string) => `fx_pending_${c}`
const STATUS_KEY = 'fx_update_status'

export interface FxPending { value: number; at: string }
export type FxDecision =
  | { accept: true; value: number; pending: null }
  | { accept: false; reason: 'invalid' | 'out_of_range'; pending: FxPending | null }

const within = (a: number, b: number) => Math.abs(a / b - 1) <= FX_TOLERANCE + 1e-9   // 부동소수 오차 허용

/** 환율 관측값 판정 (순수 함수).
 *  - ≤0·비정상 값은 거절(대기값 유지)
 *  - 저장값 없음 또는 ±15% 이내 → 수용, 대기값 삭제
 *  - 범위 밖: 직전 대기값과 같은 수준(±15%)이면 2회 연속으로 보고 수용, 아니면 대기값으로 저장 후 거절
 *    (저장값이 오래돼 정상 변동이 범위를 넘는 경우의 탈출구) */
export function evaluateFxReading(reading: number, stored: number | null, pending: FxPending | null, now = new Date()): FxDecision {
  if (!Number.isFinite(reading) || reading <= 0) return { accept: false, reason: 'invalid', pending }
  if (stored == null || !(stored > 0) || within(reading, stored)) return { accept: true, value: reading, pending: null }
  if (pending && pending.value > 0 && within(reading, pending.value)) return { accept: true, value: reading, pending: null }
  return { accept: false, reason: 'out_of_range', pending: { value: reading, at: now.toISOString() } }
}

/** settings 의 환율 값(문자열/숫자) → 숫자. 없거나 잘못되면 FALLBACK_RATES. */
export function settingsRate(settings: Record<string, unknown> | undefined, currency?: string): number {
  if (!currency || currency === 'KRW') return 1
  const n = parseFloat(String(settings?.[`exchange_rate_${currency}`] ?? ''))
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_RATES[currency] ?? 1
}

export interface FxResult {
  currency: string
  ok: boolean
  value: number | null        // 현재 저장값(갱신 성공 시 새 값)
  previous: number | null
  updatedAt: string | null    // 저장값의 갱신 시각
  reason?: string
}
export interface FxStatus { at: string; results: FxResult[] }

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
const browserStorage = (): Storage | null => typeof localStorage !== 'undefined' ? localStorage : null

function readPending(storage: Storage | null, c: string): FxPending | null {
  try { const v = JSON.parse(storage?.getItem(PENDING_KEY(c)) ?? 'null'); return v && typeof v.value === 'number' ? v : null } catch { return null }
}

/** 통화별 환율 조회 → 판정 → 반영. 실패해도 기존 값을 유지하고 결과만 돌려준다(throw 없음). */
export async function updateExchangeRates(
  currencies: string[],
  deps: { fetchQuote?: (ticker: string) => Promise<QuoteResult>; storage?: Storage | null; now?: () => Date } = {},
): Promise<FxResult[]> {
  const fetchQuote = deps.fetchQuote ?? fetchStockQuote
  const storage = deps.storage === undefined ? browserStorage() : deps.storage
  const now = deps.now ?? (() => new Date())
  const results: FxResult[] = []
  for (const currency of [...new Set(currencies)].filter(c => FX_TICKERS[c])) {
    const row = await db.settings.get(`exchange_rate_${currency}`)
    const parsed = row ? parseFloat(row.value) : NaN
    const stored = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    const updatedAt = (await db.settings.get(`exchange_rate_${currency}_updatedAt`))?.value ?? null
    const base = { currency, previous: stored, value: stored, updatedAt }
    try {
      const q = await fetchQuote(FX_TICKERS[currency])
      if (!('price' in q)) { results.push({ ...base, ok: false, reason: quoteErrorLabel(q.error, q.status) }); continue }
      const d = evaluateFxReading(q.price, stored, readPending(storage, currency), now())
      if (d.accept) {
        const at = now().toISOString()
        await saveSettings({ [`exchange_rate_${currency}`]: String(d.value), [`exchange_rate_${currency}_updatedAt`]: at })
        storage?.removeItem(PENDING_KEY(currency))
        results.push({ ...base, ok: true, value: d.value, updatedAt: at })
      } else {
        if (d.pending) storage?.setItem(PENDING_KEY(currency), JSON.stringify(d.pending))
        results.push({ ...base, ok: false, reason: d.reason === 'invalid' ? '비정상 값' : `기존 대비 ±${FX_TOLERANCE * 100}% 초과 (${q.price.toLocaleString('ko-KR')}) — 다음 갱신에서 재확인` })
      }
    } catch (e) {
      results.push({ ...base, ok: false, reason: e instanceof Error ? e.message : '조회 실패' })
    }
  }
  try { storage?.setItem(STATUS_KEY, JSON.stringify({ at: now().toISOString(), results } satisfies FxStatus)) } catch { /* 저장 공간 부족 등은 무시 */ }
  return results
}

export function readFxStatus(storage: Storage | null = browserStorage()): FxStatus | null {
  try { const v = JSON.parse(storage?.getItem(STATUS_KEY) ?? 'null'); return v && Array.isArray(v.results) ? v : null } catch { return null }
}

/** 실패 결과 → "환율 갱신 실패 · 기존 1,508.85 (2026-10-01)" 문구. 성공이면 null. */
export function fxFailureText(r: FxResult): string | null {
  if (r.ok) return null
  const label = r.currency === 'USD' ? '환율' : `${r.currency} 환율`
  const old = r.previous != null ? `기존 ${r.previous.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}` : `기본값 ${FALLBACK_RATES[r.currency] ?? '-'} 사용`
  const date = r.updatedAt ? ` (${r.updatedAt.slice(0, 10)})` : r.previous != null ? ' (갱신 기록 없음)' : ''
  return `${label} 갱신 실패 · ${old}${date}${r.reason ? ` · ${r.reason}` : ''}`
}
