// 주식 검색 컴포넌트 — 이름/티커 입력 → 검색 결과 → 선택.
// 종목명/티커/배당률/상승률 표시. 한국장/미국장 구분.
import { useState, useRef, useEffect } from 'react'

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
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = async (q: string) => {
    setQuery(q)
    if (q.trim().length < 1) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}${koreanOnly ? '&krOnly=1' : ''}`)
      const d = await r.json()
      setResults(d.results ?? [])
      setOpen(true)
    } catch { setResults([]) }
    setLoading(false)
  }

  const handleSelect = (r: StockSearchResult) => {
    onSelect(r)
    setQuery('')
    setResults([])
    setOpen(false)
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
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-gray-500">검색 중...</p>}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">검색 결과 없음</p>}
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
    </div>
  )
}
