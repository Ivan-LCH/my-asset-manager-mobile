import { useState } from 'react'
import { useUpdateAsset } from '@/hooks/useAssets'
import type { Asset, AssetType, Currency, Ownership, OwnershipPreset } from '@/types'
import { ownershipFromPreset, presetFromOwnership } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  asset: Asset
  onClose: () => void
}

const CURRENCIES: Currency[] = ['KRW', 'USD', 'JPY']

export default function AssetForm({ asset, onClose }: Props) {
  const updateMut = useUpdateAsset()
  const d = asset.detail as Record<string, unknown> | undefined

  // 공통 필드
  const [name,             setName]             = useState(asset.name)
  const [acquisitionDate,  setAcquisitionDate]  = useState(asset.acquisitionDate ?? '')
  const [acquisitionPrice, setAcquisitionPrice] = useState(asset.acquisitionPrice ?? 0)
  const [quantity,         setQuantity]         = useState(asset.quantity ?? 0)
  const [disposalDate,     setDisposalDate]     = useState(asset.disposalDate ?? '')
  const [disposalPrice,    setDisposalPrice]    = useState(asset.disposalPrice ?? 0)

  // 부동산
  const [address,       setAddress]       = useState((d?.address       as string)  ?? '')
  const [loanAmount,    setLoanAmount]    = useState((d?.loanAmount    as number)  ?? 0)
  const [tenantDeposit, setTenantDeposit] = useState((d?.tenantDeposit as number)  ?? 0)
  const [isOwned,       setIsOwned]       = useState((d?.isOwned       as boolean) ?? false)
  const [hasTenant,     setHasTenant]     = useState((d?.hasTenant     as boolean) ?? false)
  const [ownership,     setOwnership]     = useState<Ownership>((d?.ownership as Ownership) ?? { husband: 50, wife: 50 })

  // 주식
  const [accountName,   setAccountName]   = useState((d?.accountName   as string)  ?? '')
  const [currency,      setCurrency]      = useState<Currency>((d?.currency as Currency) ?? 'KRW')
  const [ticker,        setTicker]        = useState((d?.ticker         as string)  ?? '')
  const [isPensionLike, setIsPensionLike] = useState((d?.isPensionLike as boolean) ?? false)
  const [pensionStartYearStock, setPensionStartYearStock] = useState((d?.pensionStartYear as number) ?? 0)
  const [pensionMonthlyStock,   setPensionMonthlyStock]   = useState((d?.pensionMonthly   as number) ?? 0)

  // 연금
  const [pensionType,            setPensionType]            = useState((d?.pensionType            as string) ?? '')
  const [expectedStartYear,      setExpectedStartYear]      = useState((d?.expectedStartYear      as number) ?? 0)
  const [expectedEndYear,        setExpectedEndYear]        = useState((d?.expectedEndYear        as number) ?? 0)
  const [expectedMonthlyPayout,  setExpectedMonthlyPayout]  = useState((d?.expectedMonthlyPayout  as number) ?? 0)
  const [annualGrowthRate,       setAnnualGrowthRate]       = useState((d?.annualGrowthRate       as number) ?? 0)
  const [hideInChart,            setHideInChart]            = useState((d?.hideInChart            as boolean) ?? false)

  // 예적금
  const [isPensionLikeSav, setIsPensionLikeSav] = useState((d?.isPensionLike  as boolean) ?? false)
  const [pensionStartYearSav, setPensionStartYearSav] = useState((d?.pensionStartYear as number) ?? 0)
  const [pensionMonthlySav,   setPensionMonthlySav]   = useState((d?.pensionMonthly   as number) ?? 0)

  const buildDetail = (type: AssetType) => {
    if (type === 'REAL_ESTATE') return { address, loanAmount, tenantDeposit, isOwned, hasTenant, ownership }
    if (type === 'STOCK') return {
      accountName, currency, ticker: ticker || undefined,
      isPensionLike,
      ...(isPensionLike ? { pensionStartYear: pensionStartYearStock, pensionMonthly: pensionMonthlyStock } : {}),
    }
    if (type === 'PENSION') return { pensionType: pensionType || undefined, expectedStartYear, expectedEndYear, expectedMonthlyPayout, annualGrowthRate, hideInChart }
    if (type === 'SAVINGS') return {
      isPensionLike: isPensionLikeSav,
      ...(isPensionLikeSav ? { pensionStartYear: pensionStartYearSav, pensionMonthly: pensionMonthlySav } : {}),
    }
    return undefined
  }

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      name,
      acquisitionDate: acquisitionDate || undefined,
      acquisitionPrice,
      disposalDate: disposalDate || undefined,
      disposalPrice: disposalDate ? disposalPrice : undefined,
      detail: buildDetail(asset.type),
    }
    if (asset.type === 'STOCK' || asset.type === 'PHYSICAL') {
      payload.quantity = quantity
    }
    updateMut.mutate({ id: asset.id, data: payload }, { onSuccess: onClose })
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500'
  const labelCls = 'text-xs text-gray-400 mb-1 block'
  const checkCls = 'flex items-center gap-2 text-sm text-gray-300 cursor-pointer'

  return (
    <div className="bg-gray-700/30 border border-gray-600 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-200">속성 수정</p>

      {/* 공통 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>자산명</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>취득일</label>
          <input type="date" className={inputCls} value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{(asset.type === 'STOCK' || asset.type === 'PHYSICAL') ? '취득단가' : '취득가'}</label>
          <input type="number" inputMode="decimal" className={inputCls} value={acquisitionPrice} onChange={(e) => setAcquisitionPrice(+e.target.value)} />
        </div>
        {(asset.type === 'STOCK' || asset.type === 'PHYSICAL') && (
          <div>
            <label className={labelCls}>수량</label>
            <input type="number" inputMode="decimal" className={inputCls} value={quantity} onChange={(e) => setQuantity(+e.target.value)} />
          </div>
        )}
        <div>
          <label className={labelCls}>매각일</label>
          <input type="date" className={inputCls} value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
        </div>
        {disposalDate && (
          <div>
            <label className={labelCls}>매각가</label>
            <input type="number" inputMode="decimal" className={inputCls} value={disposalPrice} onChange={(e) => setDisposalPrice(+e.target.value)} />
          </div>
        )}
      </div>

      {/* 부동산 */}
      {asset.type === 'REAL_ESTATE' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase">부동산 상세</p>
          <div>
            <label className={labelCls}>주소</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
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
          {/* 명의 (건보 재산분 1인별 산정용) */}
          <div>
            <label className={labelCls}>명의 지분 (건보 재산분)</label>
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
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1 text-xs text-gray-500">남편
                  <input type="number" inputMode="decimal" className={cn(inputCls, 'w-20')} value={ownership.husband}
                    onChange={(e) => { const h = Math.min(100, Math.max(0, +e.target.value)); setOwnership({ husband: h, wife: 100 - h }) }} />%
                </label>
                <span className="text-xs text-gray-500 self-center">와이프 {ownership.wife}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 주식 */}
      {asset.type === 'STOCK' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase">주식 상세</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>계좌명</label>
              <input className={inputCls} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>통화</label>
              <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>티커 (yfinance용, 예: 005930.KS)</label>
              <input className={inputCls} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="선택사항" />
            </div>
          </div>
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
        </div>
      )}

      {/* 연금 */}
      {asset.type === 'PENSION' && (
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
            <div>
              <label className={labelCls}>월 수령 예상액</label>
              <input type="number" inputMode="decimal" className={inputCls} value={expectedMonthlyPayout} onChange={(e) => setExpectedMonthlyPayout(+e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>연 증가율 (%)</label>
              <input type="number" inputMode="decimal" step="0.1" className={inputCls} value={annualGrowthRate} onChange={(e) => setAnnualGrowthRate(+e.target.value)} />
            </div>
          </div>
          <label className={checkCls}>
            <input type="checkbox" checked={hideInChart} onChange={(e) => setHideInChart(e.target.checked)} className="accent-yellow-500" />
            대시보드 차트 제외 (주식으로 이미 집계됨)
          </label>
        </div>
      )}

      {/* 예적금 */}
      {asset.type === 'SAVINGS' && (
        <div className="space-y-3 pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 font-medium uppercase">예적금 상세</p>
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
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={updateMut.isPending}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </div>
  )
}
