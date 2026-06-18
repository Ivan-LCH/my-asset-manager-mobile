import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AssetType } from '@/types'

/** shadcn/ui 스타일 cn 헬퍼 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ₩1,234,567 (NaN/undefined → '—') */
export const formatMoney = (val: number): string =>
  Number.isFinite(val) ? `₩${Math.round(val).toLocaleString('ko-KR')}` : '—'

/** 12,340천원 (NaN/undefined → '—') */
export const formatManwon = (val: number): string =>
  Number.isFinite(val) ? `${Math.round(val / 1000).toLocaleString('ko-KR')}천원` : '—'

/** 수익/손실 색상 */
export const getPnlColor = (pnl: number) =>
  pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400'

/** +/- 부호 포함 포맷 */
export const formatPnl = (pnl: number): string =>
  `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)}`

/** 통화별 단가 포맷 — KRW: ₩376, USD: $376.00, JPY: ¥376 */
export const formatPrice = (price: number, currency = 'KRW'): string => {
  if (currency === 'KRW') return formatMoney(price)
  const sym = currency === 'USD' ? '$' : currency === 'JPY' ? '¥' : `${currency} `
  return `${sym}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 외화 평단가 포맷 — KRW: 170,000원, USD: $170.00 */
export const formatAvgPrice = (price: number, currency = 'KRW'): string => {
  if (currency === 'KRW') return `${Math.round(price).toLocaleString('ko-KR')}원`
  return formatPrice(price, currency)
}

export const TYPE_LABELS: Record<AssetType, string> = {
  REAL_ESTATE: '🏠 부동산',
  STOCK:       '📈 주식',
  PENSION:     '🛡️ 연금',
  SAVINGS:     '💰 예적금',
  PHYSICAL:    '💎 실물자산',
  ETC:         '🎸 기타',
}

export const TYPE_COLORS: Record<AssetType, string> = {
  REAL_ESTATE: '#60a5fa',
  STOCK:       '#34d399',
  PENSION:     '#fb923c',
  SAVINGS:     '#c084fc',
  PHYSICAL:    '#f87171',
  ETC:         '#a3e635',
}

export const ASSET_TYPES: AssetType[] = [
  'REAL_ESTATE', 'STOCK', 'PENSION', 'SAVINGS', 'PHYSICAL', 'ETC',
]

// ── snake_case ↔ camelCase 변환 ──────────────────────────
const toCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

const toSnake = (s: string) =>
  s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

export function deepCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(deepCamel)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [toCamel(k), deepCamel(v)])
    )
  }
  return obj
}

export function deepSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(deepSnake)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [toSnake(k), deepSnake(v)])
    )
  }
  return obj
}
