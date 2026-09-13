// "?" 토글 정보 툴팁 — RetirementPage에서 추출 (UI 간소화 ①).
import { useState } from 'react'

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-4 h-4 rounded-full bg-gray-600 hover:bg-gray-500 text-gray-300 text-xs font-bold
          flex items-center justify-center leading-none transition-colors shrink-0"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-50 w-64
          bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 shadow-2xl
          text-xs text-gray-300 leading-relaxed whitespace-pre-line pointer-events-none">
          {text}
        </span>
      )}
    </span>
  )
}
