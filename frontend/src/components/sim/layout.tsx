// 시뮬레이션 페이지 공용 레이아웃 프리미티브 (UI 간소화 ①).
// Row(라벨+입력 한 줄, hint 선택), Field(라벨 위+입력 아래), Section(세로 간격 래퍼).
import type { ReactNode } from 'react'

export function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-400 shrink-0">{label}</span>
        <div className="w-40 sm:w-48 shrink-0">{children}</div>
      </div>
      {hint && <p className="text-[11px] text-gray-600 mt-0.5 sm:text-right sm:mr-48">{hint}</p>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}
