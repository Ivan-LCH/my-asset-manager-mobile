// 허브 접이식 섹션. 한 번 연 섹션은 접어도 내용(편집 초안)을 유지한다 — hidden 으로만 숨김.
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function HubSection({ id, title, summary, open, onToggle, missing = 0, children }: {
  id: string; title: string; summary?: ReactNode; open: boolean; onToggle: () => void; missing?: number; children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  return (
    <section id={id} data-hub-section={id} data-open={open || undefined} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden scroll-mt-4">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id + '-body'}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-750">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-100">{title}</span>
          {summary && <span className="block text-xs text-gray-400 mt-0.5 truncate">{summary}</span>}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {missing > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">빠짐 {missing}</span>}
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {mounted && <div id={id + '-body'} hidden={!open} className="px-4 pb-5 pt-2 border-t border-gray-700 space-y-4">{children}</div>}
    </section>
  )
}
