import { useState } from 'react'
import { RefreshCw, Plus, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAssets, useAssetsByType } from '@/hooks/useAssets'
import { useDividendSummary } from '@/hooks/useDividends'
import { useSettings } from '@/hooks/useSettings'
import AssetCreateForm from '@/components/assets/AssetCreateForm'
import AssetChart from '@/components/common/AssetChart'
import AssetModal from '@/components/common/AssetModal'
import KpiCard from '@/components/common/KpiCard'
import { updateHistory } from '@/lib/db'
import { fetchPrices } from '@/lib/stockPrice'
import { formatMoney, formatManwon, formatPnl, formatAvgPrice, formatPrice } from '@/lib/utils'
import type { Asset, Settings, StockDetail } from '@/types'

// exchange_rate_USD → deepCamel → "exchangeRate_USD"
function getRate(settings: Settings | undefined, currency?: string): number {
  if (!currency || currency === 'KRW') return 1
  return (settings?.[`exchangeRate_${currency}`] as number) ?? 1
}

// acquisitionPrice = 주식 네이티브 통화 기준 (USD 주식 → USD, KRW 주식 → KRW)
function costKrw(asset: Asset, settings: Settings | undefined): number {
  const d    = asset.detail as StockDetail | undefined
  const rate = getRate(settings, d?.currency)
  return (asset.acquisitionPrice ?? 0) * (asset.quantity ?? 0) * rate
}

export default function StockPage() {
  const assets = useAssetsByType('STOCK')
  const { isLoading } = useAssets()
  const { data: divSummary } = useDividendSummary()
  const { data: settings }   = useSettings()
  const qc = useQueryClient()

  // 계좌별 뷰: null=계좌 목록, string=선택된 계좌명
  const [activeAccount, setActiveAccount] = useState<string | null>(null)
  const [modalId,       setModalId]       = useState<string | null>(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [updating,      setUpdating]      = useState(false)
  const [updMsg,        setUpdMsg]        = useState('')

  const modalAsset = assets.find((a) => a.id === modalId) ?? null

  const active = assets.filter((a) => !a.disposalDate)
  const sold   = assets.filter((a) => !!a.disposalDate)

  // 시세 자동 갱신: /api/price 로 단가 일괄 조회 → 오늘 이력에 반영 (모달 없이 1탭)
  const runAutoUpdate = async () => {
    const items = active
      .map((s) => ({ id: s.id, ticker: (s.detail as StockDetail | undefined)?.ticker ?? '', qty: s.quantity ?? 0 }))
      .filter((it) => it.ticker)
    if (items.length === 0) {
      setUpdMsg('ticker 가 없는 종목뿐입니다')
      setTimeout(() => setUpdMsg(''), 3000)
      return
    }
    setUpdating(true)
    setUpdMsg('갱신 중...')
    const today = new Date()
    const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const result = await fetchPrices(items.map(({ id, ticker }) => ({ id, ticker })))
    let cnt = 0
    await Promise.all(items.map(async (it) => {
      const p = result[it.id]
      if (p == null) return
      await updateHistory(it.id, todayStr, { price: p, quantity: it.qty })
      cnt++
    }))
    await qc.invalidateQueries({ queryKey: ['assets'] })
    await qc.invalidateQueries({ queryKey: ['chart'] })
    await qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
    setUpdating(false)
    setUpdMsg(cnt > 0 ? `갱신 완료 ${cnt}/${items.length}` : '갱신 실패')
    setTimeout(() => setUpdMsg(''), 4000)
  }

  const totalVal  = active.reduce((s, a) => s + a.currentValue, 0)
  const totalCost = active.reduce((s, a) => s + costKrw(a, settings), 0)
  const pnl = totalVal - totalCost
  const roi = totalCost > 0 ? (pnl / totalCost) * 100 : 0

  // 계좌별 그룹
  const accountMap = new Map<string, Asset[]>()
  for (const a of active) {
    const acct = (a.detail as StockDetail)?.accountName ?? '미분류'
    if (!accountMap.has(acct)) accountMap.set(acct, [])
    accountMap.get(acct)!.push(a)
  }
  // 계좌 내 종목: 평가액 내림차순
  for (const stocks of accountMap.values()) {
    stocks.sort((a, b) => b.currentValue - a.currentValue)
  }

  // 계좌 목록: 평가액 합계 내림차순
  const accountTotal = (stocks: Asset[]) => stocks.reduce((s, a) => s + a.currentValue, 0)
  const accountEntries = Array.from(accountMap.entries())
    .sort(([, a], [, b]) => accountTotal(b) - accountTotal(a))
  const currentStocks  = activeAccount ? (accountMap.get(activeAccount) ?? []) : []

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-100">📈 주식</h2>
          {/* 브레드크럼 */}
          {activeAccount && (
            <>
              <ChevronRight className="w-4 h-4 text-gray-600" />
              <button
                onClick={() => setActiveAccount(null)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {activeAccount}
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={runAutoUpdate}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{updating ? '갱신 중...' : '시세 업데이트'}</span>
          </button>
          {updMsg && <span className="text-xs text-gray-400 hidden sm:inline">{updMsg}</span>}
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">신규 추가</span>
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <AssetCreateForm defaultType="STOCK" onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="평가 총액" value={formatMoney(totalVal)} color="default" />
        <KpiCard
          label="평가 손익"
          value={`${formatPnl(pnl)} (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)`}
          color={pnl >= 0 ? 'green' : 'red'}
        />
        <KpiCard label="투자 원금" value={formatMoney(totalCost)} color="default" />
        <KpiCard
          label="연간 예상 배당"
          value={divSummary ? formatManwon(divSummary.totalAnnual) : '-'}
          color="blue"
          sub={divSummary ? `월 ${formatManwon(divSummary.totalMonthly)}` : undefined}
        />
      </div>

      {/* 성장 추이 차트 */}
      {active.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            📈 {activeAccount ? `${activeAccount} 성장 추이` : '전체 성장 추이'}
          </h3>
          {activeAccount ? (
            <AssetChart
              type="STOCK"
              groupBy="name"
              account={activeAccount}
              defaultPeriod="3y"
              height={200}
            />
          ) : (
            <AssetChart type="STOCK" groupBy="account" defaultPeriod="3y" height={200} />
          )}
        </div>
      )}

      {/* ── 계좌 카드 목록 ── */}
      {!activeAccount && (
        <>
          {accountEntries.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">계좌 ({accountEntries.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {accountEntries.map(([acct, stocks]) => (
                  <AccountCard
                    key={acct}
                    name={acct}
                    stocks={stocks}
                    settings={settings}
                    onClick={() => setActiveAccount(acct)}
                  />
                ))}
              </div>
            </section>
          )}

          {sold.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">매각 완료 ({sold.length})</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 opacity-55">
                {sold.map((a) => (
                  <StockTile key={a.id} asset={a} settings={settings} onClick={() => setModalId(a.id)} />
                ))}
              </div>
            </section>
          )}

          {active.length === 0 && sold.length === 0 && (
            <div className="text-center py-16 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700">
              등록된 주식 자산이 없습니다.
            </div>
          )}
        </>
      )}

      {/* ── 계좌 선택 후: 종목 타일 ── */}
      {activeAccount && (
        <>
          {/* 계좌 요약 배너 */}
          <AccountSummaryBanner
            name={activeAccount}
            stocks={currentStocks}
            settings={settings}
            onBack={() => setActiveAccount(null)}
          />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">
              종목 ({currentStocks.length})
              <span className="ml-1.5 text-gray-600">· 클릭하면 상세 확인</span>
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {currentStocks.map((a) => (
                <StockTile
                  key={a.id}
                  asset={a}
                  settings={settings}
                  accountTotal={currentStocks.reduce((s, x) => s + x.currentValue, 0)}
                  onClick={() => setModalId(a.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* 모달 */}
      <AssetModal asset={modalAsset} onClose={() => setModalId(null)} />
    </div>
  )
}

/* ── 계좌 카드 ── */
function AccountCard({
  name, stocks, settings, onClick,
}: {
  name: string
  stocks: Asset[]
  settings: Settings | undefined
  onClick: () => void
}) {
  const val  = stocks.reduce((s, a) => s + a.currentValue, 0)
  const cost = stocks.reduce((s, a) => s + costKrw(a, settings), 0)
  const pnl  = val - cost
  const roi  = cost > 0 ? (pnl / cost) * 100 : 0
  const topStocks = stocks.slice(0, 3)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-700 bg-gray-800
        hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5
        transition-all duration-200 p-4 group"
    >
      {/* 계좌명 + 종목 수 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-100 group-hover:text-blue-300 transition-colors">
            {name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{stocks.length}개 종목</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors mt-0.5" />
      </div>

      {/* 평가액 + 손익 */}
      <div className="mb-3">
        <p className="text-xl font-bold text-gray-100 tracking-tight">{formatManwon(val)}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {pnl >= 0
            ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
          <span className={`text-sm font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{formatManwon(pnl)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            pnl >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 보유 종목 미리보기 */}
      <div className="border-t border-gray-700/50 pt-3 space-y-1">
        {topStocks.map((a) => {
          const aCost = costKrw(a, settings)
          const aPnl  = a.currentValue - aCost
          const aRoi  = aCost > 0 ? (aPnl / aCost) * 100 : 0
          return (
            <div key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-400 truncate max-w-[120px]">{a.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-gray-300">{formatManwon(a.currentValue)}</span>
                <span className={aRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {aRoi >= 0 ? '+' : ''}{aRoi.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
        {stocks.length > 3 && (
          <p className="text-xs text-gray-600">외 {stocks.length - 3}개 종목</p>
        )}
      </div>
    </button>
  )
}

/* ── 계좌 선택 후 요약 배너 ── */
function AccountSummaryBanner({
  name, stocks, settings, onBack,
}: {
  name: string
  stocks: Asset[]
  settings: Settings | undefined
  onBack: () => void
}) {
  const val  = stocks.reduce((s, a) => s + a.currentValue, 0)
  const cost = stocks.reduce((s, a) => s + costKrw(a, settings), 0)
  const pnl  = val - cost
  const roi  = cost > 0 ? (pnl / cost) * 100 : 0

  return (
    <div className="bg-gray-800 border border-blue-500/30 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            ← 전체
          </button>
          <div>
            <p className="text-sm font-bold text-blue-400">{name}</p>
            <p className="text-xs text-gray-500">{stocks.length}개 종목</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-100">{formatManwon(val)}</p>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className={`text-sm font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnl >= 0 ? '+' : ''}{formatManwon(pnl)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              pnl >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 종목 타일 ── */
function StockTile({ asset, settings, accountTotal, onClick }: {
  asset: Asset
  settings: Settings | undefined
  accountTotal?: number
  onClick: () => void
}) {
  const isSold   = !!asset.disposalDate
  const valKrw   = isSold ? (asset.disposalPrice ?? 0) : asset.currentValue
  const d        = asset.detail as StockDetail | undefined
  const currency = d?.currency ?? 'KRW'
  const isFx     = currency !== 'KRW'
  const rate     = getRate(settings, currency)
  const avgPrice = asset.acquisitionPrice ?? 0
  const qty      = asset.quantity ?? 0

  // 외화: cost는 외화 기준, krw 환산으로 pnl 계산
  const costFx  = avgPrice * qty                      // 외화 매입원가
  const costKrw_ = costFx * rate                      // KRW 환산 매입원가
  const cost    = isFx ? costKrw_ : costFx            // KRW 기준 cost
  const pnlKrw  = valKrw - cost
  const valFx   = isFx ? valKrw / rate : 0            // 외화 평가액
  const pnlFx   = isFx ? valFx - costFx : 0          // 외화 손익
  const roi     = cost > 0 ? (pnlKrw / cost) * 100 : 0
  // 현재가(주당) — 외화는 KRW 평가액을 환율·수량으로 역산해 네이티브 통화 표기
  const currentPrice = qty > 0 ? (isFx ? valKrw / qty / rate : valKrw / qty) : 0

  // 일간 등락 (전일 단가 대비) — 매각 종목은 미표시. 수량 변동 영향 제거 위해 단가 기준
  const prevPrice    = asset.previousPrice
  const hasDaily     = !isSold && prevPrice != null && prevPrice > 0 && currentPrice > 0
  const priceChange  = hasDaily ? currentPrice - (prevPrice as number) : 0
  const priceChangePct = hasDaily ? (priceChange / (prevPrice as number)) * 100 : 0

  // 계좌 내 비중
  const weight = !isSold && accountTotal && accountTotal > 0
    ? (valKrw / accountTotal) * 100
    : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-700 bg-gray-800
        hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/5
        transition-all duration-200 p-4 space-y-3 group"
    >
      {/* 상단: 손익 인디케이터 + 이름 + 비중 */}
      <div className="flex items-start gap-3">
        <div className={`w-1 self-stretch rounded-full shrink-0 mt-0.5 ${
          pnlKrw > 0 ? 'bg-emerald-500' : pnlKrw < 0 ? 'bg-red-500' : 'bg-gray-600'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-gray-100 truncate group-hover:text-blue-300 transition-colors">
              {asset.name}
            </p>
            {weight != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-medium shrink-0">
                {weight.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {d?.ticker && (
              <span className="text-xs text-gray-500 font-mono">{d.ticker}</span>
            )}
            {d?.currency && d.currency !== 'KRW' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 font-medium">
                {d.currency}
              </span>
            )}
            {isSold && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">매각</span>
            )}
          </div>
        </div>
      </div>

      {/* 평가액 */}
      <div>
        <p className="text-lg font-bold text-gray-100 tracking-tight">{formatManwon(valKrw)}</p>
        {isFx && rate > 1 && (
          <p className="text-xs text-blue-400 font-mono mt-0.5">{formatPrice(valFx, currency)}</p>
        )}
        <p className="text-xs text-gray-500 mt-0.5">{qty.toLocaleString()}주 보유</p>
      </div>

      <div className="border-t border-gray-700/60" />

      {/* 하단: 현재가/평단가 + 손익 */}
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          {!isSold && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 w-10">현재가</span>
              <span className="text-xs text-gray-200 font-mono">{formatAvgPrice(currentPrice, currency)}</span>
              {hasDaily && (
                <span className={`text-[10px] font-medium ${
                  priceChange > 0 ? 'text-emerald-400' : priceChange < 0 ? 'text-red-400' : 'text-gray-500'
                }`}>
                  (오늘 {priceChange >= 0 ? '+' : ''}{formatPrice(priceChange, currency)} {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-10">평단가</span>
            <span className="text-xs text-gray-400 font-mono">{formatAvgPrice(avgPrice, currency)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 mb-0.5">
            {pnlKrw > 0
              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              : pnlKrw < 0
              ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              : <Minus className="w-3.5 h-3.5 text-gray-500" />}
            <span className={`text-sm font-bold ${
              pnlKrw > 0 ? 'text-emerald-400' : pnlKrw < 0 ? 'text-red-400' : 'text-gray-500'
            }`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </span>
          </div>
          {isFx && rate > 1 ? (
            <>
              <p className={`text-xs font-mono ${pnlKrw > 0 ? 'text-emerald-400' : pnlKrw < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {pnlFx >= 0 ? '+' : ''}{formatPrice(pnlFx, currency)}
              </p>
              <p className={`text-xs ${pnlKrw > 0 ? 'text-emerald-400/70' : pnlKrw < 0 ? 'text-red-400/70' : 'text-gray-500'}`}>
                {pnlKrw >= 0 ? '+' : ''}{formatManwon(pnlKrw)}
              </p>
            </>
          ) : (
            <p className={`text-xs ${pnlKrw > 0 ? 'text-emerald-400' : pnlKrw < 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {pnlKrw >= 0 ? '+' : ''}{formatManwon(pnlKrw)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
