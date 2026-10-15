import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AssetType } from '@/types'

/** shadcn/ui 스타일 cn 헬퍼 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── 금액·수량·비율 표기 공통 코어 ─────────────────────────────
// 원칙: null/undefined/NaN/Infinity → '—'(미입력), 반올림 "후" 부호 결정(-0 → 0), 부호는 기호·숫자 앞.
export const MISSING = '—'
export type AmountUnit = 'won' | 'manwon' | 'eok'
export interface FmtAmountOptions {
  /** won: 1,234원 · manwon: 1,234만원 · eok: 1억 이상 1.15억, 미만은 만원 */
  unit?: AmountUnit
  /** true면 양수에 '+' (0은 부호 없음) */
  sign?: boolean
  /** won 단위를 ₩1,234 형식으로 */
  symbol?: boolean
}

/** 반올림 결과의 -0 을 0 으로 */
const noNegZero = (n: number) => (Object.is(n, -0) ? 0 : n)
const signOf = (n: number, sign?: boolean) => (n < 0 ? '-' : n > 0 && sign ? '+' : '')

export function fmtAmount(v: number | null | undefined, { unit = 'won', sign, symbol }: FmtAmountOptions = {}): string {
  if (v == null || !Number.isFinite(v)) return MISSING
  if (unit === 'won') {
    const n = noNegZero(Math.round(v))
    const body = Math.abs(n).toLocaleString('ko-KR')
    return signOf(n, sign) + (symbol ? `₩${body}` : `${body}원`)
  }
  const man = noNegZero(Math.round(v / 10000))
  // 만원 반올림 후 1억(10,000만원) 이상이면 억 — 99,995,000 → "1억" (이전: "10,000만원")
  if (unit === 'eok' && Math.abs(man) >= 10000) {
    const eok = noNegZero(Number((v / 1e8).toFixed(2)))
    return signOf(eok, sign) + `${Math.abs(eok).toFixed(2).replace(/\.?0+$/, '')}억`
  }
  return signOf(man, sign) + `${Math.abs(man).toLocaleString('ko-KR')}만원`
}

/** 수량 — 소수 최대 8자리(코인·소수점 주식), 미입력 '—' */
export function fmtQty(v: number | null | undefined, unit = ''): string {
  if (v == null || !Number.isFinite(v)) return MISSING
  const n = noNegZero(Number(v.toFixed(8)))
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 8 }) + unit
}

/** 비율 — 반올림 후 부호(-0.0% 방지), sign 이면 양수에 '+' */
export function fmtPct(v: number | null | undefined, digits = 1, { sign }: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return MISSING
  const n = noNegZero(Number(v.toFixed(digits)))
  return signOf(n, sign) + `${Math.abs(n).toFixed(digits)}%`
}

/** ₩1,234,567 (NaN/undefined → '—') */
export const formatMoney = (val: number | null | undefined): string => fmtAmount(val, { symbol: true })

/** 1,234만원 (NaN/undefined → '—') */
export const formatManwon = (val: number | null | undefined): string => fmtAmount(val, { unit: 'manwon' })

/** 1,234원 — 원 단위 정수 표기 (planner 등 공용) */
export const formatWon = (val: number | null | undefined): string => fmtAmount(val)

/** 1.15억 / 3,981만원 — 합계 보조 표시용 */
export const formatEok = (val: number | null | undefined): string => fmtAmount(val, { unit: 'eok' })

/** 수익/손실 색상 */
export const getPnlColor = (pnl: number) =>
  pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400'

/** +/- 부호 포함 포맷 (반올림 후 부호 — 0은 부호 없음) */
export const formatPnl = (pnl: number | null | undefined): string => fmtAmount(pnl, { symbol: true, sign: true })

/** +/- 부호 포함 만원 포맷 — `{pnl>=0?'+':''}{formatManwon(pnl)}` 대체 */
export const formatPnlManwon = (pnl: number | null | undefined): string => fmtAmount(pnl, { unit: 'manwon', sign: true })

/** 통화별 단가 포맷 — KRW: ₩376, USD: $376.00, JPY: ¥376 */
export const formatPrice = (price: number | null | undefined, currency = 'KRW', { sign }: { sign?: boolean } = {}): string => {
  if (currency === 'KRW') return fmtAmount(price, { symbol: true, sign })
  if (price == null || !Number.isFinite(price)) return MISSING
  const sym = currency === 'USD' ? '$' : currency === 'JPY' ? '¥' : `${currency} `
  const n = noNegZero(Number(price.toFixed(2)))
  return `${signOf(n, sign)}${sym}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 외화 평단가 포맷 — KRW: 170,000원, USD: $170.00 */
export const formatAvgPrice = (price: number | null | undefined, currency = 'KRW'): string => {
  if (currency === 'KRW') return fmtAmount(price)
  return formatPrice(price, currency)
}

/** 'YYYY-MM-DD' → '2026년 10월 15일 (목)' — 형식이 아니면 원문, 빈 값 '—' */
export function formatKoreanDate(value: string | null | undefined, { weekday = true }: { weekday?: boolean } = {}): string {
  if (!value) return MISSING
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(2000, mo - 1, d))
  dt.setUTCFullYear(y)
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return value
  const wd = '일월화수목금토'[dt.getUTCDay()]
  return `${y}년 ${mo}월 ${d}일` + (weekday ? ` (${wd})` : '')
}

/** 금액(원) 입력 — 정수부의 숫자만 남겨 천단위 콤마 ('' 는 빈칸 유지, 0 허용, 앞자리 0 제거) */
export function formatAmountInput(raw: string): string {
  const digits = raw.split('.')[0].replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}
/** '1,234,000' → 1234000 ('' → null) */
export function parseAmountInput(text: string): number | null {
  const digits = text.split('.')[0].replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

/** 취득가/단가 입력 방식 — 원화가 확실한 금액만 true(천단위 콤마 AmountInput), 그 외는 소수 허용 number 입력.
 *  STOCK 은 계좌 통합(원금=원화)이거나 currency==='KRW' 일 때만 원화.
 *  PHYSICAL 은 통화를 저장하지 않아 외화 단가일 수 있으므로 항상 소수 입력 허용.
 *  그 외 유형의 취득가는 원화 총액. */
export function isKrwPriceInput(type: AssetType, currency: string, isAccountLevel = false): boolean {
  if (type === 'STOCK') return isAccountLevel || currency === 'KRW'
  if (type === 'PHYSICAL') return false
  return true
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

/** name/account 처럼 자산유형이 아닌 라벤을 위한 보조 팔레트 (안정 분배용) */
export const EXTRA_PALETTE = ['#fbbf24', '#22d3ee', '#f472b6', '#2dd4bf', '#a78bfa', '#fb7185']

/** 차트 라벨(🏠 부동산 등) → 색상. 단일 소스: TYPE_LABELS↔TYPE_COLORS 역매핑.
 *  자산유형 라벨은 항상 TYPE_COLORS, 그 외 라벨(name/account)은 안정 해시로 팔레트 분배. */
const _LABEL_COLOR: Record<string, string> = Object.fromEntries(
  (Object.keys(TYPE_LABELS) as AssetType[]).map((t) => [TYPE_LABELS[t], TYPE_COLORS[t]]),
)
export function colorForLabel(label: string): string {
  if (_LABEL_COLOR[label]) return _LABEL_COLOR[label]
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return EXTRA_PALETTE[h % EXTRA_PALETTE.length]
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
