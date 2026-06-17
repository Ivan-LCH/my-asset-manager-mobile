import { useState } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { updateHistory } from '@/lib/db'
import { formatPrice } from '@/lib/utils'
import type { Asset, StockDetail } from '@/types'

interface Props {
  stocks: Asset[]
  onClose: () => void
}

/** 오늘 날짜(YYYY-MM-DD, 로컬) */
function todayStr(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/**
 * 시세 수동 업데이트 모달 (M-2).
 * yfinance 백엔드 제거로, 종목별 단가를 직접 입력 → 오늘 날짜 이력에 반영.
 * db.updateHistory 가 price*수량*환율 로 value 를 계산하고 currentValue 를 동기화한다.
 */
export default function StockPriceUpdateModal({ stocks, onClose }: Props) {
  const qc = useQueryClient()
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const today = todayStr()

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(
        stocks.map(async (s) => {
          const raw = prices[s.id]
          if (raw === undefined || raw.trim() === '') return
          const price = parseFloat(raw)
          if (Number.isNaN(price) || price < 0) return
          // 수량은 그대로 유지 → db가 value(=price*qty*환율) 계산
          await updateHistory(s.id, today, { price, quantity: s.quantity })
        }),
      )
      await qc.invalidateQueries({ queryKey: ['assets'] })
      await qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-28 bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-100 text-right focus:outline-none focus:border-blue-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-lg h-full sm:h-auto sm:max-h-[90vh] flex flex-col bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-100">📉 시세 업데이트</h2>
            <p className="text-xs text-gray-500 mt-0.5">{today} 기준 · 단가 입력</p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 바디 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {stocks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">업데이트할 종목이 없습니다.</p>
          ) : (
            stocks.map((s) => {
              const d = s.detail as StockDetail | undefined
              const currency = d?.currency ?? 'KRW'
              const isFx = currency !== 'KRW'
              const hist = s.history
              const lastPrice = hist.length ? hist[hist.length - 1].price : s.acquisitionPrice
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      현재 {lastPrice != null ? formatPrice(lastPrice, currency) : '-'}
                      {isFx && <span className="ml-1 text-blue-400/70">({currency})</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isFx && <span className="text-xs text-gray-400">$</span>}
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="새 단가"
                      value={prices[s.id] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [s.id]: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 푸터 */}
        <div className="flex gap-2 px-5 py-3 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2.5 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || stocks.length === 0}
            className="flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
