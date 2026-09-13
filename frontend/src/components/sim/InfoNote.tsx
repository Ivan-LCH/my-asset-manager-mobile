// 접이식 안내 박스 — 다줄 설명을 한 줄 요약으로 접어두고 탭하면 펼침 (UI 간소화 ②).
// tone: 'warn'(노랑·면책 고지) | 'info'(파랑·일반 설명). 기본 접힘.
// 한 줄 짜리 문맥 힌트는 이 컴포넌트 대신 그대로 인라인 텍스트 사용.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoNote({ tone = 'info', summary, children, defaultOpen = false }: {
  tone?: 'info' | 'warn'
  summary: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('info-note rounded-xl border p-2.5',
      tone === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-blue-500/5 border-blue-700/30')}>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left">
        <span className={cn('text-xs font-medium leading-snug',
          tone === 'warn' ? 'text-yellow-200/90' : 'text-blue-200/90')}>
          {tone === 'warn' ? '⚠️ ' : 'ℹ️ '}{summary}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 ml-auto transition-transform',
          open && 'rotate-180', tone === 'warn' ? 'text-yellow-400/70' : 'text-blue-400/70')} />
      </button>
      {open && (
        <div className={cn('text-xs leading-relaxed mt-1.5 space-y-1',
          tone === 'warn' ? 'text-yellow-200/80' : 'text-blue-200/80')}>
          {children}
        </div>
      )}
    </div>
  )
}
