import { useState, useEffect } from 'react'
import { Save, RefreshCw, PieChart } from 'lucide-react'
import { usePortfolio, useSavePortfolio, DEFAULT_PORTFOLIO } from '@/hooks/usePortfolio'
import { blendedYield } from '@/lib/corpSim'
import type { PortfolioHolding, PortfolioYield } from '@/types'

export default function PortfolioPage() {
  const { data: saved } = usePortfolio()
  const saveMut = useSavePortfolio()

  const [holdings, setHoldings] = useState<PortfolioHolding[]>(DEFAULT_PORTFOLIO.holdings)
  const [yieldVal, setYieldVal] = useState(0)
  const [yields, setYields] = useState<PortfolioYield[]>([])
  const [loading, setLoading] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (saved) {
      setHoldings(saved.holdings)
      setYieldVal(saved.blendedYield)
    }
  }, [saved])

  const fetchYields = async () => {
    setLoading(true)
    const tickers = holdings.map((h) => h.ticker).filter(Boolean)
    const results: PortfolioYield[] = await Promise.all(
      tickers.map(async (t) => {
        try {
          const r = await fetch(`/api/yield?ticker=${encodeURIComponent(t)}`)
          if (!r.ok) return { ticker: t, yield: 0 }
          const d = await r.json()
          return { ticker: t, yield: d.avg3yYield ?? 0 }
        } catch {
          return { ticker: t, yield: 0 }
        }
      }),
    )
    setYields(results)
    const blended = blendedYield(results, holdings)
    setYieldVal(Math.round(blended * 100) / 100)
    setDirty(true)
    setLoading(false)
  }

  const handleSave = () => {
    saveMut.mutate({ holdings, blendedYield: yieldVal }, { onSuccess: () => setDirty(false) })
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-lg mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100">📊 투자 포트폴리오</h2>
        <button
          onClick={handleSave}
          disabled={!dirty || saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {saveMut.isPending ? '저장 중...' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        법인 시뮬·연금 시뮬이 공통으로 참조하는 투자 포트폴리오. 종목과 비중을 입력하고 "배당률 자동 산정"을 누르면 Yahoo에서 3년 평균 배당률을 가져와 가중평균 수익률을 계산.
      </p>

      {/* 종목 리스트 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-3">
        {holdings.map((h, i) => {
          const y = yields.find((v) => v.ticker === h.ticker)?.yield
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                value={h.ticker}
                onChange={(e) => {
                  const p = [...holdings]; p[i] = { ...p[i], ticker: e.target.value.toUpperCase() }
                  setHoldings(p); setDirty(true)
                }}
                placeholder="TICKER"
              />
              <input
                type="number" inputMode="decimal"
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm text-gray-100 text-center focus:outline-none focus:border-blue-500"
                value={h.weight || ''}
                onChange={(e) => {
                  const p = [...holdings]; p[i] = { ...p[i], weight: Number(e.target.value) }
                  setHoldings(p); setDirty(true)
                }}
              />
              <span className="text-xs text-gray-500">비중</span>
              {typeof y === 'number' && y > 0 && (
                <span className="text-xs text-emerald-400 shrink-0 ml-auto">{y.toFixed(2)}%</span>
              )}
              <button
                onClick={() => { setHoldings(holdings.filter((_, j) => j !== i)); setDirty(true) }}
                className="p-2 text-gray-600 hover:text-red-400 transition-colors shrink-0 text-xs"
              >
                삭제
              </button>
            </div>
          )
        })}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => { setHoldings([...holdings, { ticker: '', weight: 1 }]); setDirty(true) }}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            ＋ 종목 추가
          </button>
          <button
            onClick={() => void fetchYields()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '조회 중...' : '배당률 자동 산정'}
          </button>
        </div>
      </div>

      {/* 가중평균 수익률 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <p className="text-xs text-gray-500 mb-1">가중평균 배당수익률 (3년 평균 기준)</p>
        <p className="text-2xl font-bold text-blue-400">
          {yieldVal > 0 ? `${yieldVal}%` : '—'}
        </p>
        {yieldVal === 0 && (
          <p className="text-xs text-gray-500 mt-1">위 "배당률 자동 산정" 버튼을 누르세요.</p>
        )}
        <p className="text-[11px] text-gray-600 mt-2">
          이 수익률이 법인 시뮬·연금 시뮬에 자동 반영됩니다.
        </p>
      </div>
    </div>
  )
}
