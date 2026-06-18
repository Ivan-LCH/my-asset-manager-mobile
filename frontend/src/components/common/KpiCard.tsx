import { cn } from '@/lib/utils'

interface KpiCardProps {
  label:    string
  value:    string
  sub?:     string
  color?:   'default' | 'red' | 'blue' | 'green'
  className?: string
}

const COLOR_MAP = {
  default: { text: 'text-gray-100',    bar: 'bg-gray-600',     bg: '' },
  red:     { text: 'text-red-400',     bar: 'bg-red-500',      bg: 'bg-red-500/5' },
  blue:    { text: 'text-blue-400',    bar: 'bg-blue-500',     bg: 'bg-blue-500/5' },
  green:   { text: 'text-emerald-400', bar: 'bg-emerald-500',  bg: 'bg-emerald-500/5' },
}

export default function KpiCard({ label, value, sub, color = 'default', className }: KpiCardProps) {
  const c = COLOR_MAP[color]
  return (
    <div className={cn(
      'relative bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 sm:px-4 sm:py-4 overflow-hidden',
      c.bg,
      className
    )}>
      {/* 상단 컬러 바 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar}`} />
      <p className="text-[11px] sm:text-xs text-gray-400 font-medium mb-2 truncate">{label}</p>
      <p className={cn('text-[13px] sm:text-lg font-bold tracking-tight leading-tight break-words', c.text)}>{value}</p>
      {sub && <p className="text-[11px] sm:text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}
