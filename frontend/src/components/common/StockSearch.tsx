// 주식 검색 컴포넌트 — 이름/티커 입력 → 검색 결과 → 선택.
// 종목명/티커/배당률/상승률 표시. 검색 실패 시 직접 입력 폼.
import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StockSearchResult {
  ticker: string
  name: string
  exchange: string     // 'KRX' | 'NASDAQ' | 'NYSE' 등
  yield?: number
  growth?: number
}

interface Props {
  koreanOnly?: boolean              // IRP는 한국장만
  onSelect: (r: StockSearchResult) => void
  placeholder?: string
}

export default function StockSearch({ koreanOnly, onSelect, placeholder = '종목명 또는 티커' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [showManual, setShowManual] = useState(false)
  // 수동 입력 폼
  const [mTicker, setMTicker] = useState('')
  const [mName, setMName] = useState('')
  const [mYield, setMYield] = useState('')
  const [mGrowth, setMGrowth] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setShowManual(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = async (q: string) => {
    setQuery(q)
    setShowManual(false)
    if (q.trim().length < 1) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}${koreanOnly ? '&krOnly=1' : ''}`)
      const d = await r.json()
      setResults(d.results ?? [])
      setOpen(true)
    } catch { setResults([]); setOpen(true) }
    setLoading(false)
  }

  const handleSelect = (r: StockSearchResult) => {
    onSelect(r)
    setQuery(''); setResults([]); setOpen(false)
  }

  const handleManualSubmit = () => {
    const ticker = mTicker.trim().toUpperCase()
    if (!ticker) return
    handleSelect({
      ticker,
      name: mName.trim() || ticker,
      exchange: koreanOnly ? 'KRX' : 'MANUAL',
      yield: mYield ? Number(mYield) : undefined,
      growth: mGrowth ? Number(mGrowth) : undefined,
    })
    setMTicker(''); setMName(''); setMYield(''); setMGrowth('')
    setShowManual(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        placeholder={placeholder + (koreanOnly ? ' (한국장)' : '')}
        value={query}
        onChange={(e) => void search(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results.length > 0) handleSelect(results[0]) }}
      />
      {open && !showManual && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-gray-500">검색 중...</p>}
          {!loading && results.length === 0 && (
            <div className="p-3">
              <p className="text-xs text-gray-500 mb-2">검색 결과 없음 (Yahoo에 등록되지 않은 종목일 수 있음)</p>
              <button onClick={() => setShowManual(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> 직접 입력하기
              </button>
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 hover:bg-gray-700 border-b border-gray-700/50 last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-100 truncate">{r.name}</p>
                  <p className="text-[10px] text-gray-500">{r.ticker} · {r.exchange}</p>
                </div>
                <div className="text-right text-[10px] shrink-0">
                  {r.yield != null && <p className="text-emerald-400">배당 {r.yield}%</p>}
                  {r.growth != null && <p className="text-cyan-400">상승 {r.growth}%</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {/* 직접 입력 폼 */}
      {showManual && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-300">직접 입력</p>
          <input type="text" placeholder="티커 (예: 471920.KS)" value={mTicker}
            onChange={(e) => setMTicker(e.target.value.toUpperCase())}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
          <input type="text" placeholder="종목명 (예: KODEX 미국나스닥100)" value={mName}
            onChange={(e) => setMName(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
          <div className="flex gap-2">
            <input type="number" placeholder="배당률%" value={mYield}
              onChange={(e) => setMYield(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-emerald-300 text-right focus:outline-none focus:border-emerald-500" />
            <input type="number" placeholder="상승률%" value={mGrowth}
              onChange={(e) => setMGrowth(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-cyan-300 text-right focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleManualSubmit} disabled={!mTicker.trim()}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
              추가
            </button>
            <button onClick={() => setShowManual(false)}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
