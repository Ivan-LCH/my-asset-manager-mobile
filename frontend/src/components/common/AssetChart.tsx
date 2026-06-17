import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useChart } from '@/hooks/useAssets'
import PeriodFilter, { Period } from './PeriodFilter'
import type { AssetType, ChartDataPoint } from '@/types'
import { TYPE_COLORS, cn } from '@/lib/utils'

interface CustomTooltipProps {
  active?:  boolean
  payload?: { name: string; value: number; color: string }[]
  label?:   string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const hasMultiple = payload.length > 1

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[140px]">
      <p className="text-xs text-gray-400 mb-2 font-medium">{label}</p>
      <div className="space-y-1.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="text-xs text-gray-400 truncate">{p.name}</span>
            </div>
            <span className="text-xs font-semibold text-gray-100 shrink-0">{`${Math.round(p.value / 1000000).toLocaleString('ko-KR')}백만`}</span>
          </div>
        ))}
      </div>
      {hasMultiple && (
        <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">합계</span>
          <span className="text-sm font-bold text-blue-400">{`${Math.round(total / 1000000).toLocaleString('ko-KR')}백만`}</span>
        </div>
      )}
      {!hasMultiple && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-500">합계</span>
          <span className="text-sm font-bold text-blue-400">{`${Math.round(total / 1000000).toLocaleString('ko-KR')}백만`}</span>
        </div>
      )}
    </div>
  )
}

// recharts용: label별 색상 반환
const LABEL_COLOR_MAP: Record<string, string> = {
  '🏠 부동산':   TYPE_COLORS.REAL_ESTATE,
  '📈 주식':     TYPE_COLORS.STOCK,
  '🛡️ 연금':    TYPE_COLORS.PENSION,
  '💰 예적금':    TYPE_COLORS.SAVINGS,
  '💰 예적금/현금': TYPE_COLORS.SAVINGS,
  '💎 실물자산': TYPE_COLORS.PHYSICAL,
  '🎸 기타':     TYPE_COLORS.ETC,
}
const FALLBACK_COLORS = ['#60a5fa', '#34d399', '#fb923c', '#c084fc', '#f87171', '#a3e635', '#fbbf24']

interface AssetChartProps {
  type?:          AssetType
  groupBy?:       'type' | 'name' | 'account'
  account?:       string
  height?:        number
  periodOptions?: Period[]
  defaultPeriod?: Period
}

// recharts 데이터 변환: [{date, label, value}] → [{date, [label]: value}]
function pivot(data: ChartDataPoint[]) {
  const map = new Map<string, Record<string, number | string>>()
  for (const d of data) {
    if (!map.has(d.date)) map.set(d.date, { date: d.date })
    map.get(d.date)![d.label] = d.value
  }
  return Array.from(map.values())
}

function getLabels(data: ChartDataPoint[]): string[] {
  const labels = [...new Set(data.map((d) => d.label))]
  // 가장 최근 날짜 기준 값 합산 후 내림차순 정렬
  const lastDate = data.reduce((max, d) => (d.date > max ? d.date : max), '')
  const lastValues = new Map<string, number>()
  for (const d of data) {
    if (d.date === lastDate) lastValues.set(d.label, (lastValues.get(d.label) ?? 0) + d.value)
  }
  return labels.sort((a, b) => (lastValues.get(b) ?? 0) - (lastValues.get(a) ?? 0))
}

type ViewMode = 'cumulative' | 'daily'

function DailyTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const v = payload[0].value ?? 0
  const isUp = v >= 0
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[120px]">
      <p className="text-xs text-gray-400 mb-1.5 font-medium">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">전일 대비</span>
        <span className={`text-sm font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{Math.round(v / 1000000).toLocaleString('ko-KR')}백만
        </span>
      </div>
    </div>
  )
}

export default function AssetChart({
  type,
  groupBy = 'type',
  account,
  height = 220,
  periodOptions,
  defaultPeriod = 'all',
}: AssetChartProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod)
  const [zeroBased, setZeroBased] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('cumulative')
  const { data = [], isLoading } = useChart({ type, period, group_by: groupBy, account })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        로딩 중...
      </div>
    )
  }
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        데이터 없음
      </div>
    )
  }

  const pivoted = pivot(data)
  const labels  = getLabels(data)

  // 일별 증감 모드는 단/중기에서만 의미 있음 (장기는 막대가 너무 많아 노이즈)
  const isDailyAllowed = period === '1m' || period === '3m' || period === '1y'
  const effectiveMode: ViewMode = viewMode === 'daily' && isDailyAllowed ? 'daily' : 'cumulative'

  // 차트 종류: 짧은 기간(1m/3m)은 누적 막대, 그 외는 누적 영역
  const isShortPeriod = period === '1m' || period === '3m'

  // y축 스케일: zeroBased면 0부터, 아니면 각 시점 합계 기준으로 변동폭을 강조
  const yDomain: [number | string, number | string] = (() => {
    if (zeroBased) return [0, 'auto']
    const totals = pivoted.map((row) =>
      labels.reduce((s, label) => s + ((row[label] as number) || 0), 0),
    )
    if (totals.length === 0) return [0, 'auto']
    const min = Math.min(...totals)
    const max = Math.max(...totals)
    const pad = Math.max((max - min) * 0.15, max * 0.01)
    return [Math.max(0, min - pad), max + pad]
  })()

  const commonAxes = (
    <>
      <XAxis
        dataKey="date"
        tick={{ fill: '#6b7280', fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: string) => (isShortPeriod ? v.slice(5, 10) : v.slice(2, 7))}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fill: '#6b7280', fontSize: 10 }}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: number) => `${Math.round(v / 1000000).toLocaleString()}백만`}
        width={44}
        domain={yDomain}
        allowDataOverflow={!zeroBased}
      />
      <Tooltip content={<CustomTooltip />} cursor={isShortPeriod ? { fill: 'rgba(255,255,255,0.04)' } : undefined} />
      {labels.length > 1 && (
        <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 8 }} />
      )}
    </>
  )

  // 일별 증감 데이터: 합계의 전일 대비 차이
  const dailyData = pivoted.map((row, i) => {
    const total = labels.reduce((s, l) => s + ((row[l] as number) || 0), 0)
    const prevTotal = i > 0
      ? labels.reduce((s, l) => s + ((pivoted[i - 1][l] as number) || 0), 0)
      : total
    return { date: row.date as string, change: i > 0 ? total - prevTotal : 0 }
  })

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3 sm:justify-end sm:gap-2">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {([['추이', 'cumulative'], ['일별 증감', 'daily']] as const).map(([label, val]) => {
            const disabled = val === 'daily' && !isDailyAllowed
            const active = effectiveMode === val
            return (
              <button
                key={val}
                onClick={() => !disabled && setViewMode(val)}
                disabled={disabled}
                title={disabled ? '단기·중기 기간(1m/3m/1y)에서만 사용 가능합니다' : undefined}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        {effectiveMode === 'cumulative' && (
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {([['0부터', true], ['자동', false]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setZeroBased(val)}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors',
                  zeroBased === val
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <PeriodFilter value={period} onChange={setPeriod} options={periodOptions} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {effectiveMode === 'daily' ? (
          <BarChart data={dailyData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => (isShortPeriod ? v.slice(5, 10) : v.slice(2, 7))}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${Math.round(v / 1000000).toLocaleString()}백만`}
              width={44}
            />
            <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} />
            <Tooltip content={<DailyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="change" fillOpacity={0.85}>
              {dailyData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.change >= 0 ? '#10b981' : '#ef4444'}
                />
              ))}
            </Bar>
          </BarChart>
        ) : isShortPeriod ? (
          <BarChart data={pivoted} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            {commonAxes}
            {labels.map((label, i) => {
              const color = LABEL_COLOR_MAP[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <Bar
                  key={label}
                  dataKey={label}
                  stackId="1"
                  fill={color}
                  fillOpacity={0.85}
                />
              )
            })}
          </BarChart>
        ) : (
          <AreaChart data={pivoted} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              {labels.map((label, i) => {
                const color = LABEL_COLOR_MAP[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
                return (
                  <linearGradient key={label} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0}   />
                  </linearGradient>
                )
              })}
            </defs>
            {commonAxes}
            {labels.map((label, i) => {
              const color = LABEL_COLOR_MAP[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <Area
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stackId="1"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${i})`}
                />
              )
            })}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
