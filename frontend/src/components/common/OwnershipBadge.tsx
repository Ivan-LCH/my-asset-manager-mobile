import type { Ownership } from '@/types'
import { cn } from '@/lib/utils'

/** 자산의 명의(남편%/와이프%)를 작은 배지로 표시. 50:50은 중립색, 편중은 강조. */
export default function OwnershipBadge({ ownership, className }: { ownership: Ownership; className?: string }) {
  const neutral = ownership.husband === 50 && ownership.wife === 50
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
      neutral ? 'bg-gray-700 text-gray-300' : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
      className,
    )}>
      👤 {ownership.husband}% / {ownership.wife}%
    </span>
  )
}
