// 설명 문단 접기 — 기본 접힘, ⓘ 한 줄만 보인다 (UI 간소화 A안). 정보는 지우지 않고 안쪽에 둔다.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function MoreInfo({ label = '설명', children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <details className={cn('more-info text-xs text-gray-400', className)} data-more-info>
      <summary className="cursor-pointer w-fit text-gray-500 hover:text-gray-300 select-none">ⓘ {label}</summary>
      <div className="mt-1 space-y-1 leading-relaxed">{children}</div>
    </details>
  )
}
