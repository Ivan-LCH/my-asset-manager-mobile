import { useState, useEffect } from 'react'
import { useCreateAsset, useAssetsByType } from '@/hooks/useAssets'
import type { Asset, AssetType, Currency, StockDetail, Ownership, OwnershipPreset } from '@/types'
import { ownershipFromPreset, presetFromOwnership } from '@/types'
import { TYPE_LABELS, ASSET_TYPES, cn } from '@/lib/utils'
import StockSearch from '@/components/common/StockSearch'
import { fetchStockPrice } from '@/lib/stockPrice'

interface Props {
  defaultType?: AssetType
  defaultAccountName?: string   // 계좌 내에서 추가 시 현재 계좌를 기본값으로
  onClose: () => void
}

const CURRENCIES: Currency[] = ['KRW', 'USD', 'JPY']

export default function AssetCreateForm({ defaultType, defaultAccountName, onClose }: Props) {
  const createMut = useCreateAsset()
  const existingStocks = useAssetsByType('STOCK')
  const existingAccounts = Array.from(new Set(
    existingStocks
      .map((s) => (s.detail as StockDetail | undefined)?.accountName)
      .filter((x): x is string => !!x),
  ))

  const [type,             setType]             = useState<AssetType>(defaultType ?? 'STOCK')
  const [name,             setName]             = useState('')
  const [acquisitionDate,  setAcquisitionDate]  = useState(new Date().toISOString().slice(0, 10))
  const [acquisitionPrice, setAcquisitionPrice] = useState(0)
  const [quantity,         setQuantity]         = useState(0)

  // 부동산
  const [address,       setAddress]       = useState('')
  const [loanAmount,    setLoanAmount]    = useState(0)
  const [tenantDeposit, setTenantDeposit] = useState(0)
  const [isOwned,       setIsOwned]       = useState(false)
  const [hasTenant,     setHasTenant]     = useState(false)
  const [ownership,     setOwnership]     = useState<Ownership>({ husband: 50, wife: 50 })

  // 주식
  const [stockMode,     setStockMode]     = useState<'stock' | 'account'>('stock')
  const [accountName,   setAccountName]   = useState(defaultAccountName ?? '')
  // 사용자가 계좌명을 직접 고쳤으면 자동 채우기로 덮어쓰지 않음
  const [accountTouched, setAccountTouched] = useState(false)
  const [currency,      setCurrency]      = useState<Currency>('KRW')
  const [ticker,        setTicker]        = useState('')
  const [isPensionLike, setIsPensionLike] = useState(false)
  const [pensionStartYearStock, setPensionStartYearStock] = useState(0)
  const [pensionMonthlyStock,   setPensionMonthlyStock]   = useState(0)
  const [accountValue,    setAccountValue]    = useState(0)  // 계좌 통합: 현재 평가액
  const [annualDividend,  setAnnualDividend]  = useState(0)  // 계좌 통합: 연간 배당금

  // 연금
  const [pensionType,            setPensionType]           = useState('')
  const [expectedStartYear,      setExpectedStartYear]     = useState(new Date().getFullYear() + 20)
  const [expectedEndYear,        setExpectedEndYear]       = useState(new Date().getFullYear() + 40)
  const [expectedMonthlyPayout,  setExpectedMonthlyPayout] = useState(0)
  const [annualGrowthRate,       setAnnualGrowthRate]      = useState(3)

  // 예적금
  const [isPensionLikeSav,    setIsPensionLikeSav]    = useState(false)
  const [pensionStartYearSav, setPensionStartYearSav] = useState(0)
  const [pensionMonthlySav,   setPensionMonthlySav]   = useState(0)

  // 동일 이름의 기존 종목이 있으면 티커/통화/계좌 자동 채움
  useEffect(() => {
    if (type !== 'STOCK' || !name.trim()) return
    const match = existingStocks.find((s) => s.name.trim() === name.trim())
    if (!match) return
    const d = (match as Asset).detail as StockDetail | undefined
    if (d?.ticker) setTicker(d.ticker)
    if (d?.currency) setCurrency(d.currency)
    // 계좌명: 사용자가 직접 고쳤거나, 계좌 안에서 추가(기본 계좌 지정)한 경우에는 자동으로 덮어쓰지 않음
    if (d?.accountName && !accountTouched && !defaultAccountName) setAccountName(d.accountName)
  }, [name, type, existingStocks, accountTouched, defaultAccountName])

  // 종목 검색 선택 — 이름/티커/통화 자동 채움 + 현재 시세로 취득단가 자동 조회
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceHint,    setPriceHint]    = useState('')
  const handlePickStock = (r: { ticker: string; name: string; exchange: string; currency?: string }) => {
    setName(r.name)
    setTicker(r.ticker)
    const cur = r.currency ?? (r.ticker.endsWith('.KS') || r.ticker.endsWith('.KQ') ? 'KRW' : 'USD')
    setCurrency(cur as Currency)
    // 취득단가 자동 조회 — 티커 있으면 현재가로 채움 (수동 수정 가능)
    if (acquisitionPrice === 0) {
      setPriceLoading(true)
      setPriceHint('시세 조회 중...')
      void fetchStockPrice(r.ticker).then((p) => {
        setPriceLoading(false)
        if (p != null) {
          setAcquisitionPrice(p)
          setPriceHint(`현재가 ${p.toLocaleString()} ${cur} 자동 입력 (수정 가능)`)
        } else {
          setPriceHint('시세 조회 실패 — 직접 입력하세요')
        }
        setTimeout(() => setPriceHint(''), 4000)
      })
    }
  }

  const buildDetail = () => {
    if (type === 'REAL_ESTATE') return { address, loanAmount, tenantDeposit, isOwned, hasTenant }
    if (type === 'STOCK') {
      // 계좌 통합 모드 — 계좌 하나가 자산 하나. 티커/수량 없음, 연간 배당금을 dps로 저장(수량=1)
      if (stockMode === 'account') return {
        accountName: accountName || name, currency: 'KRW', isAccountLevel: true, isPensionLike,
        dividendDps: annualDividend || undefined, dividendCycle: '연간',
        ...(isPensionLike ? { pensionStartYear: pensionStartYearStock, pensionMonthly: pensionMonthlyStock } : {}),
      }
      return {
        accountName, currency, ticker: ticker || undefined, isPensionLike,
        ...(isPensionLike ? { pensionStartYear: pensionStartYearStock, pensionMonthly: pensionMonthlyStock } : {}),
      }
    }
    if (type === 'PENSION') return {
      pensionType: pensionType || undefined,
      expectedStartYear, expectedEndYear, expectedMonthlyPayout, annualGrowthRate,
    }
    if (type === 'SAVINGS') return {
      isPensionLike: isPensionLikeSav,
      ...(isPensionLikeSav ? { pensionStartYear: pensionStartYearSav, pensionMonthly: pensionMonthlySav } : {}),
    }
    return undefined
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    // 계좌 통합 모드 — 평가액 직접 입력, 수량=1, 취득단가=총 원금
    if (type === 'STOCK' && stockMode === 'account') {
      createMut.mutate({
        type, name, acquisitionDate,
        acquisitionPrice,
        currentValue: accountValue,
        quantity: 1,
        ownership,
        detail: buildDetail(),
        initialHistory: { date: acquisitionDate, value: accountValue || null },
      }, { onSuccess: onClose })
      return
    }
    createMut.mutate({
      type,
      name,
      acquisitionDate,
      acquisitionPrice,
      quantity: (type === 'STOCK' || type === 'PHYSICAL') ? quantity : undefined,
      ownership,
      detail: buildDetail(),
    }, { onSuccess: onClose })
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500'
  const labelCls = 'text-xs text-gray-400 mb-1 block'
  const checkCls = 'flex items-center gap-2 text-sm text-gray-300 cursor-pointer'

  // 상세 옵션 접기 — 필수 항목만 먼저 보이고 나머지는 펼쳐서 입력
  const [showDetail, setShowDetail] = useState(false)
  const detailToggle = (
    <button type="button"
      onClick={() => setShowDetail((v) => !v)}
      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
    >
      {showDetail ? '▾' : '▸'} 상세 옵션
    </button>
  )

  return (
    <div className="space-y-4">
      {/* 자산 유형 */}
      {!defaultType && (
        <div>
          <label className={labelCls}>자산 유형</label>
          <div className="flex flex-wrap gap-2">
            {ASSET_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  type === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 공통 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>
            {type === 'STOCK' && stockMode === 'account' ? '계좌명 *' : '자산명 *'}
          </label>
          {type === 'STOCK' && stockMode === 'stock' ? (
            // 개별 종목 — 검색 자동완성 (프리셋 즉시 + Yahoo API)
            <>
              <StockSearch
                placeholder="종목명 검색 (예: 삼성전자, 나스닥, SCHD)"
                onSelect={handlePickStock}
              />
              {name && (
                <p className="text-xs text-blue-400 mt-1">
                  ✓ {name}{ticker ? ` (${ticker})` : ''}
                  <button type="button" onClick={() => { setName(''); setTicker('') }}
                    className="ml-2 text-gray-500 hover:text-gray-300 underline underline-offset-2">초기화</button>
                </p>
              )}
            </>
          ) : (
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'STOCK' && stockMode === 'account'
              ? '예: 키움 IRP 계좌'
              : '예: 삼성전자, 강남 아파트...'}
          />
          )}
        </div>
        <div>
          <label className={labelCls}>취득일</label>
          <input type="date" className={inputCls} value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>
            {type === 'STOCK' && stockMode === 'account' ? '총 원금 (만원 아님, 원)' : (type === 'STOCK' || type === 'PHYSICAL') ? '취득단가' : '취득가'}
            {type === 'STOCK' && stockMode === 'stock' && priceLoading && <span className="text-blue-400"> (조회 중...)</span>}
          </label>
          <input type="number" inputMode="decimal" className={inputCls} value={acquisitionPrice} onChange={(e) => setAcquisitionPrice(+e.target.value)} />
          {type === 'STOCK' && stockMode === 'stock' && priceHint && (
            <p className="text-[10px] text-blue-400/80 mt-1">{priceHint}</p>
          )}
        </div>
        {type === 'STOCK' && stockMode === 'account' && (
          <div className="col-span-2">
            <label className={labelCls}>현재 평가액 (원)</label>
            <input type="number" inputMode="decimal" className={inputCls} value={accountValue} onChange={(e) => setAccountValue(+e.target.value)} placeholder="계좌 전체 현재 가치" />
          </div>
        )}
        {(type === 'STOCK' || type === 'PHYSICAL') && stockMode !== 'account' && (
          <div>
            <label className={labelCls}>수량</label>
            <input type="number" inputMode="decimal" className={inputCls} value={quantity} onChange={(e) => setQuantity(+e.target.value)} />
          </div>
        )}
      </div>

      {/* 부동산 */}
      {type === 'REAL_ESTATE' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <div>
            <label className={labelCls}>주소</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {detailToggle}
          {showDetail && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>대출금</label>
                  <input type="number" inputMode="decimal" className={inputCls} value={loanAmount} onChange={(e) => setLoanAmount(+e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>보증금</label>
                  <input type="number" inputMode="decimal" className={inputCls} value={tenantDeposit} onChange={(e) => setTenantDeposit(+e.target.value)} />
                </div>
              </div>
              <div className="flex gap-5">
                <label className={checkCls}>
                  <input type="checkbox" checked={isOwned} onChange={(e) => setIsOwned(e.target.checked)} className="accent-blue-500" />
                  자가 거주
                </label>
                <label className={checkCls}>
                  <input type="checkbox" checked={hasTenant} onChange={(e) => setHasTenant(e.target.checked)} className="accent-blue-500" />
                  세입자 있음
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* 주식 */}
      {type === 'STOCK' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          {/* 모드 선택: 개별 종목 / 계좌 통합 */}
          <div className="flex gap-1 bg-gray-700/50 rounded-lg p-1">
            {([['stock', '📋 개별 종목'], ['account', '🏛️ 계좌 통합']] as const).map(([m, label]) => (
              <button key={m} type="button"
                onClick={() => setStockMode(m)}
                className={cn('flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
                  stockMode === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200')}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">
            {stockMode === 'stock'
              ? '종목별로 티커·수량·평단가를 입력해 관리 (시세 자동 갱신·배당 상세 지원)'
              : '계좌 전체를 자산 하나로 등록 — 평가액·원금만 입력 (연금 연동·명의는 계좌 단위 유지)'}
          </p>

          {stockMode === 'stock' && (
            <div>
              <label className={labelCls}>계좌명</label>
              <input
                className={inputCls}
                value={accountName}
                onChange={(e) => { setAccountTouched(true); setAccountName(e.target.value) }}
                list="stock-accounts"
                placeholder="선택 또는 신규 입력"
              />
              <datalist id="stock-accounts">
                {existingAccounts.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>
          )}
          {stockMode === 'account' && (
            <div>
              <label className={labelCls}>연간 배당금 (원, 선택)</label>
              <input type="number" inputMode="decimal" className={inputCls} value={annualDividend} onChange={(e) => setAnnualDividend(+e.target.value)} placeholder="예: 1200000" />
            </div>
          )}
          {detailToggle}
          {showDetail && (
            <>
              {stockMode === 'stock' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>통화</label>
                    <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>티커</label>
                    <input className={inputCls} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="예: 005930.KS (선택)" />
                  </div>
                </div>
              )}
              <label className={checkCls}>
                <input type="checkbox" checked={isPensionLike} onChange={(e) => setIsPensionLike(e.target.checked)} className="accent-blue-500" />
                연금형 (pension simulation 포함)
              </label>
              {isPensionLike && (
                <div className="grid grid-cols-2 gap-3 pl-2">
                  <div>
                    <label className={labelCls}>연금 개시 연도</label>
                    <input type="number" inputMode="decimal" className={inputCls} value={pensionStartYearStock} onChange={(e) => setPensionStartYearStock(+e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>월 수령액</label>
                    <input type="number" inputMode="decimal" className={inputCls} value={pensionMonthlyStock} onChange={(e) => setPensionMonthlyStock(+e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 연금 */}
      {type === 'PENSION' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase">연금 상세</p>
          <div>
            <label className={labelCls}>연금 종류</label>
            <input className={inputCls} value={pensionType} onChange={(e) => setPensionType(e.target.value)} placeholder="국민연금, 퇴직연금 등" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>수령 시작 연도</label>
              <input type="number" inputMode="decimal" className={inputCls} value={expectedStartYear} onChange={(e) => setExpectedStartYear(+e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>수령 종료 연도</label>
              <input type="number" inputMode="decimal" className={inputCls} value={expectedEndYear} onChange={(e) => setExpectedEndYear(+e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>월 수령 예상액</label>
              <input type="number" inputMode="decimal" className={inputCls} value={expectedMonthlyPayout} onChange={(e) => setExpectedMonthlyPayout(+e.target.value)} />
            </div>
          </div>
          {detailToggle}
          {showDetail && (
            <div>
              <label className={labelCls}>연 증가율 (%)</label>
              <input type="number" inputMode="decimal" step="0.1" className={inputCls} value={annualGrowthRate} onChange={(e) => setAnnualGrowthRate(+e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* 예적금 */}
      {type === 'SAVINGS' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          {detailToggle}
          {showDetail && (
            <>
              <label className={checkCls}>
                <input type="checkbox" checked={isPensionLikeSav} onChange={(e) => setIsPensionLikeSav(e.target.checked)} className="accent-blue-500" />
                연금형 (pension simulation 포함)
              </label>
              {isPensionLikeSav && (
                <div className="grid grid-cols-2 gap-3 pl-2">
                  <div>
                    <label className={labelCls}>연금 개시 연도</label>
                    <input type="number" inputMode="decimal" className={inputCls} value={pensionStartYearSav} onChange={(e) => setPensionStartYearSav(+e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>월 수령액</label>
                    <input type="number" inputMode="decimal" className={inputCls} value={pensionMonthlySav} onChange={(e) => setPensionMonthlySav(+e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 공용 명의 (전 자산 공통) — 주식은 계좌 단위 명의 관리를 사용하므로 폼에서 제외 */}
      {type !== 'STOCK' && <div className="space-y-2 pt-2 border-t border-gray-700">
        <p className="text-xs text-gray-500 font-medium uppercase">명의 지분 (전 자산 공통)</p>
        <p className="text-[11px] text-gray-600">부부 가정 시 보통 50:50. 퇴직연금·국민연금 등 본인 자산은 '내 100%'. 1인별 건보·세금 산정에 활용.</p>
        <div className="flex gap-1">
          {(['mine', 'half', 'wife', 'custom'] as OwnershipPreset[]).map((p) => (
            <button key={p} type="button" onClick={() => setOwnership(ownershipFromPreset(p))}
              className={cn('flex-1 px-2 py-1 text-xs rounded transition-colors',
                presetFromOwnership(ownership) === p ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}>
              {p === 'mine' ? '내 100%' : p === 'half' ? '50:50' : p === 'wife' ? '와이프 100%' : '직접'}
            </button>
          ))}
        </div>
        {presetFromOwnership(ownership) === 'custom' && (
          <div className="flex gap-3">
            <label className="flex items-center gap-1 text-xs text-gray-500">남편
              <input type="number" inputMode="decimal" className={cn(inputCls, 'w-20')} value={ownership.husband}
                onChange={(e) => { const h = Math.min(100, Math.max(0, +e.target.value)); setOwnership({ husband: h, wife: 100 - h }) }} />%
            </label>
            <span className="text-xs text-gray-500 self-center">와이프 {ownership.wife}%</span>
          </div>
        )}
      </div>}

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={createMut.isPending || !name.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </div>
  )
}
