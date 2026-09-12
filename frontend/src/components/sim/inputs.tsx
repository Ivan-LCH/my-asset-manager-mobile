// 시뮬레이션 페이지 공용 입력 프리미티브 (UI 간소화 ①).
// 금액(천단위 콤마·blur 확정), 숫자(%·접미사), 텍스트, 연도, 횟수 입력을 통일 스타일로 제공.
import { useState, useEffect } from 'react'

/** 입력용 숫자 포맷 — 0 이하/NaN은 빈값 (AmountInput 내부 전용 의미) */
export function numFmt(v: number | string) {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
  return Number.isFinite(n) && n > 0 ? Math.round(n).toLocaleString() : ''
}

/** 콤마 제거 후 숫자 변환 (실패 시 0) */
export function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }

export function AmountInput({ value, onChange, placeholder = '금액' }: {
  value: number; onChange: (v: number) => void; placeholder?: string
}) {
  const [raw, setRaw] = useState(value > 0 ? numFmt(value) : '')
  useEffect(() => { setRaw(value > 0 ? numFmt(value) : '') }, [value])
  return (
    <input type="text" inputMode="numeric"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
      placeholder={placeholder} value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => { const n = parseNum(raw); onChange(n); setRaw(n > 0 ? numFmt(n) : '') }}
    />
  )
}

export function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" inputMode="decimal"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500"
        value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span className="text-xs text-gray-500 shrink-0">{suffix}</span>}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input type="text"
      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)} />
  )
}

export function YearInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" inputMode="decimal"
      className="w-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
  )
}

export function TimesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input type="number" inputMode="decimal" min={0}
      className="w-12 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 text-center"
      value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
  )
}
