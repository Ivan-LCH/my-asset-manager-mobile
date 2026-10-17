import { db } from './schema'

// ──────────────────────────────────────────────────────────────
// 환율
//
// 백엔드(frankfurter/yfinance)가 사라졌으므로, settings 에 캐시된
// `exchange_rate_<통화>` 값을 우선 사용하고, 없으면 기본값으로 대체한다.
// (원본 dividends.py 의 COALESCE 로직과 동일)
// ──────────────────────────────────────────────────────────────
export const FALLBACK_RATES: Record<string, number> = { USD: 1450, JPY: 9.5 }

export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === 'KRW') return 1
  const row = await db.settings.get(`exchange_rate_${currency}`)
  if (row) {
    const n = parseFloat(row.value)
    if (!Number.isNaN(n) && n > 0) return n
  }
  return FALLBACK_RATES[currency] ?? 1
}
