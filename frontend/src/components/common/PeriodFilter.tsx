import { cn } from '@/lib/utils'

export type Period = 'all' | '10y' | '3y' | '1y' | '3m' | '1m'

const OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: '10y', label: '10년' },
  { value: '3y',  label: '3년'  },
  { value: '1y',  label: '1년'  },
  { value: '3m',  label: '3개월' },
  { value: '1m',  label: '1개월' },
]

interface PeriodFilterProps {
  value:    Period
  onChange: (p: Period) => void
  options?: Period[]
}

export default function PeriodFilter({ value, onChange, options }: PeriodFilterProps) {
  const shown = options
    ? OPTIONS.filter((o) => options.includes(o.value))
    : OPTIONS

  return (
    <>
      {/* 모바일: 드롭다운(한 줄 배치용) */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        aria-label="기간"
        className="sm:hidden bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
      >
        {shown.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* 데스크톱: 버튼 그룹 */}
      <div className="hidden sm:flex gap-1 bg-gray-800 rounded-lg p-1">
        {shown.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              value === o.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  )
}
