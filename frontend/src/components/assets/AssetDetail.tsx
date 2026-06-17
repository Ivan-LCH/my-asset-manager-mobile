import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, Pencil, Check, X } from 'lucide-react'
import KpiCard from '@/components/common/KpiCard'
import HistoryTable from './HistoryTable'
import AssetForm from './AssetForm'
import DividendSection from './DividendSection'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { useDeleteAsset, useUpdateAsset } from '@/hooks/useAssets'
import { useSettings } from '@/hooks/useSettings'
import { formatMoney, formatManwon, formatPnl, formatPrice, formatAvgPrice, TYPE_LABELS } from '@/lib/utils'
import type { Asset, RealEstateDetail, Settings, StockDetail, PensionDetail } from '@/types'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

function getRate(settings: Settings | undefined, currency?: string): number {
  if (!currency || currency === 'KRW') return 1
  return (settings?.[`exchangeRate_${currency}`] as number) ?? 1
}

interface Props {
  asset:     Asset
  chartData?: { date: string; value: number }[]
}

type Tab = 'info' | 'dividend'

export default function AssetDetail({ asset, chartData }: Props) {
  const [showForm,      setShowForm]      = useState(false)
  const [confirmDel,    setConfirmDel]    = useState(false)
  const [tab,           setTab]           = useState<Tab>('info')
  const [editingAvg,    setEditingAvg]    = useState(false)
  const [avgPriceInput, setAvgPriceInput] = useState('')
  const deleteMut = useDeleteAsset()
  const updateMut = useUpdateAsset()
  const { data: settings } = useSettings()

  const a     = asset
  const d     = a.detail as (RealEstateDetail & StockDetail & PensionDetail) | undefined
  const isSold = !!a.disposalDate
  const displayVal = isSold ? (a.disposalPrice ?? 0) : a.currentValue

  // KPI 계산
  let k1: string, v1: string, k2: string, v2: string, k3: string, v3: string
  let c1: 'default' | 'red' | 'blue' | 'green' = 'default'
  let c2: 'default' | 'red' | 'blue' | 'green' = 'default'
  let c3: 'default' | 'red' | 'blue' | 'green' = 'blue'
  let pnlSub = ''   // 평가금액/손익 카드의 sub 문자열 (STOCK/PHYSICAL 전용)

  if (a.type === 'REAL_ESTATE') {
    const liab   = (d?.loanAmount ?? 0) + (d?.tenantDeposit ?? 0)
    const equity = displayVal - liab
    k1 = isSold ? '매각 금액' : '현재 시세'; v1 = formatMoney(displayVal)
    k2 = '부채 총계';                          v2 = formatMoney(liab);     c2 = 'red'
    k3 = '순자산 (Equity)';                   v3 = formatMoney(equity);   c3 = 'blue'
  } else if (a.type === 'STOCK' || a.type === 'PHYSICAL') {
    // acquisitionPrice = 네이티브 통화 기준 (USD 주식 → USD, KRW → KRW)
    const currency = (d as StockDetail | undefined)?.currency ?? 'KRW'
    const isFx     = a.type === 'STOCK' && currency !== 'KRW'
    const rate     = getRate(settings, currency)
    const avgPrice = a.acquisitionPrice ?? 0
    const qty      = a.quantity ?? 0
    const costFx   = avgPrice * qty
    const costKrw  = isFx ? costFx * rate : costFx
    const pnlKrw   = displayVal - costKrw
    const roi      = costKrw > 0 ? (pnlKrw / costKrw) * 100 : 0

    k1 = '평가금액/손익'
    v1 = formatMoney(displayVal)
    c1 = pnlKrw >= 0 ? 'green' : 'red'
    pnlSub = (isFx && rate > 1)
      ? `${pnlKrw >= 0 ? '+' : ''}${formatPrice(displayVal / rate - costFx, currency)} / ${formatPnl(pnlKrw)} (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)`
      : `${formatPnl(pnlKrw)} (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)`

    k2 = '평단가'
    v2 = formatAvgPrice(avgPrice, currency)   // 네이티브 통화 표시
    c2 = 'default'

    k3 = '보유 수량'; v3 = `${qty.toLocaleString()}`; c3 = 'default'
  } else {
    k1 = '현재 가치';  v1 = formatMoney(displayVal)
    k2 = '취득가';     v2 = formatMoney(a.acquisitionPrice ?? 0)
    k3 = '변동액';     v3 = formatMoney(displayVal - (a.acquisitionPrice ?? 0))
    c3 = displayVal >= (a.acquisitionPrice ?? 0) ? 'green' : 'red'
  }

  const miniChart = chartData
    ? chartData.map((c) => ({ ...c, valueMan: c.value / 1000 }))
    : a.history.map((h) => ({
        date: h.date,
        valueMan: (h.value ?? 0) / 1000,
      })).sort((x, y) => x.date.localeCompare(y.date))

  return (
    <div className="space-y-5">
      {/* 주식 전용 탭 */}
      {asset.type === 'STOCK' && (
        <div className="flex gap-1 border-b border-gray-700 pb-0">
          {(['info', 'dividend'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                tab === t
                  ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'info' ? '📋 기본 정보' : '💵 배당금'}
            </button>
          ))}
        </div>
      )}

      {/* 배당 탭 */}
      {asset.type === 'STOCK' && tab === 'dividend' && (
        <DividendSection asset={asset} />
      )}

      {/* 기본 정보 (info 탭 또는 비주식 자산) */}
      {(asset.type !== 'STOCK' || tab === 'info') && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCell
          label={a.type === 'REAL_ESTATE' ? '주소' : a.type === 'STOCK' ? '계좌' : '유형'}
          value={
            a.type === 'REAL_ESTATE' ? (d?.address ?? '-')
            : a.type === 'STOCK' ? (d?.accountName ?? '-')
            : TYPE_LABELS[a.type]
          }
        />
        <InfoCell label="취득일" value={a.acquisitionDate ?? '-'} />
        {a.type === 'STOCK' ? (
          <AvgPriceCell
            asset={a}
            currency={(d as StockDetail | undefined)?.currency ?? 'KRW'}
            editing={editingAvg}
            input={avgPriceInput}
            onInputChange={setAvgPriceInput}
            onEdit={() => { setAvgPriceInput(String(a.acquisitionPrice ?? 0)); setEditingAvg(true) }}
            onSave={() => {
              const v = parseFloat(avgPriceInput)
              if (!isNaN(v) && v >= 0) updateMut.mutate({ id: a.id, data: { acquisitionPrice: v } })
              setEditingAvg(false)
            }}
            onCancel={() => setEditingAvg(false)}
          />
        ) : (
          <InfoCell
            label={a.type === 'PHYSICAL' ? '투자원금' : '취득가'}
            value={
              a.type === 'PHYSICAL'
                ? formatMoney((a.acquisitionPrice ?? 0) * (a.quantity ?? 0))
                : formatMoney(a.acquisitionPrice ?? 0)
            }
          />
        )}
        <InfoCell
          label="상태"
          value={isSold ? `매각 (${a.disposalDate})` : '보유중'}
          valueClass={isSold ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}
        />

        {a.type === 'REAL_ESTATE' && (
          <>
            <InfoCell label="대출금" value={formatMoney(d?.loanAmount ?? 0)} valueClass="text-red-300" />
            <InfoCell label="보증금" value={formatMoney(d?.tenantDeposit ?? 0)} valueClass="text-orange-300" />
            <div className="bg-gray-700/40 rounded-lg px-3 py-2.5">
              <p className="text-xs text-gray-500 mb-1.5">구분</p>
              <div className="flex gap-1.5 flex-wrap">
                {d?.isOwned
                  ? <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs">자가</span>
                  : <span className="px-2 py-0.5 rounded-full bg-gray-600 text-gray-400 text-xs">임대</span>}
                {d?.hasTenant
                  ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">세입자O</span>
                  : null}
              </div>
            </div>
            <div />
          </>
        )}

        {a.type === 'STOCK' && d?.ticker && (
          <InfoCell label="티커" value={d.ticker} />
        )}

        {a.type === 'PENSION' && (
          <div className="col-span-2 sm:col-span-4 bg-gray-700/40 rounded-lg px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-1">연 증가율</p>
            <p className="text-blue-400 font-semibold">{d?.annualGrowthRate ?? 0}%</p>
          </div>
        )}
      </div>}

      {/* KPI 카드 */}
      {(asset.type !== 'STOCK' || tab === 'info') && <div className="grid grid-cols-3 gap-3">
        <KpiCard label={k1} value={v1} sub={pnlSub || undefined} color={c1} />
        <KpiCard label={k2} value={v2} color={c2} />
        <KpiCard label={k3} value={v3} color={c3} />
      </div>}

      {/* 미니 차트 */}
      {(asset.type !== 'STOCK' || tab === 'info') && miniChart.length > 1 && (
        <div className="bg-gray-700/30 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-3 font-medium">가치 변동 추이</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={miniChart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mini-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} axisLine={false}
                tickFormatter={(v: string) => v.slice(2, 7)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}천`}
                width={52}
              />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: number) => [`${v.toLocaleString()}천원`]}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              />
              <Area
                type="monotone" dataKey="valueMan"
                stroke="#60a5fa" strokeWidth={2}
                fill="url(#mini-grad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 이력 테이블 */}
      {(asset.type !== 'STOCK' || tab === 'info') && <HistoryTable asset={asset} />}

      {/* 액션 버튼 */}
      <div className="flex gap-2 pt-1 border-t border-gray-700/50">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          {showForm ? '수정 닫기' : '속성 수정'}
          {showForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        <button
          onClick={() => setConfirmDel(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> 삭제
        </button>
      </div>

      {showForm && <AssetForm asset={asset} onClose={() => setShowForm(false)} />}

      <ConfirmDialog
        open={confirmDel}
        title="자산 삭제"
        message={`"${asset.name}"을(를) 영구적으로 삭제합니다. 이력도 모두 삭제됩니다.`}
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => deleteMut.mutate(asset.id)}
      />
    </div>
  )
}

function InfoCell({
  label, value, valueClass = 'text-gray-200',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-gray-700/40 rounded-lg px-3 py-2.5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-medium truncate ${valueClass}`}>{value}</p>
    </div>
  )
}

function AvgPriceCell({ asset, currency, editing, input, onInputChange, onEdit, onSave, onCancel }: {
  asset: Asset
  currency: string
  editing: boolean
  input: string
  onInputChange: (v: string) => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const isFx = currency !== 'KRW'
  const avg  = asset.acquisitionPrice ?? 0
  return (
    <div className="bg-gray-700/40 rounded-lg px-3 py-2.5">
      <p className="text-xs text-gray-500 mb-1">
        평단가{isFx ? <span className="text-blue-400/80 ml-1">({currency})</span> : ''}
      </p>
      {editing ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 shrink-0">{isFx ? '$' : '₩'}</span>
          <input
            type="number" inputMode="decimal"
            step={isFx ? '0.01' : '1'}
            placeholder={isFx ? '0.00' : '0'}
            className="w-full bg-gray-600 text-gray-100 text-sm rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            autoFocus
          />
          <button onClick={onSave}  className="p-2 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={onCancel} className="p-2 text-gray-500 hover:text-gray-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button onClick={onEdit} className="flex items-center gap-1 group/avg">
          <span className="text-sm font-medium text-gray-200 font-mono">
            {formatAvgPrice(avg, currency)}
          </span>
          <Pencil className="w-3 h-3 text-gray-600 group-hover/avg:text-blue-400 transition-colors" />
        </button>
      )}
    </div>
  )
}
