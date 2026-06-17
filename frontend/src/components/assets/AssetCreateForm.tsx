import { useState } from 'react'
import { useCreateAsset } from '@/hooks/useAssets'
import type { AssetType, Currency } from '@/types'
import { TYPE_LABELS, ASSET_TYPES } from '@/lib/utils'

interface Props {
  defaultType?: AssetType
  onClose: () => void
}

const CURRENCIES: Currency[] = ['KRW', 'USD', 'JPY']

export default function AssetCreateForm({ defaultType, onClose }: Props) {
  const createMut = useCreateAsset()

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

  // 주식
  const [accountName,   setAccountName]   = useState('')
  const [currency,      setCurrency]      = useState<Currency>('KRW')
  const [ticker,        setTicker]        = useState('')
  const [isPensionLike, setIsPensionLike] = useState(false)
  const [pensionStartYearStock, setPensionStartYearStock] = useState(0)
  const [pensionMonthlyStock,   setPensionMonthlyStock]   = useState(0)

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

  const buildDetail = () => {
    if (type === 'REAL_ESTATE') return { address, loanAmount, tenantDeposit, isOwned, hasTenant }
    if (type === 'STOCK') return {
      accountName, currency, ticker: ticker || undefined, isPensionLike,
      ...(isPensionLike ? { pensionStartYear: pensionStartYearStock, pensionMonthly: pensionMonthlyStock } : {}),
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
    createMut.mutate({
      type,
      name,
      acquisitionDate,
      acquisitionPrice,
      quantity: (type === 'STOCK' || type === 'PHYSICAL') ? quantity : undefined,
      detail: buildDetail(),
    }, { onSuccess: onClose })
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500'
  const labelCls = 'text-xs text-gray-400 mb-1 block'
  const checkCls = 'flex items-center gap-2 text-sm text-gray-300 cursor-pointer'

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
          <label className={labelCls}>자산명 *</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 삼성전자, 강남 아파트..."
          />
        </div>
        <div>
          <label className={labelCls}>취득일</label>
          <input type="date" className={inputCls} value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{(type === 'STOCK' || type === 'PHYSICAL') ? '취득단가' : '취득가'}</label>
          <input type="number" inputMode="decimal" className={inputCls} value={acquisitionPrice} onChange={(e) => setAcquisitionPrice(+e.target.value)} />
        </div>
        {(type === 'STOCK' || type === 'PHYSICAL') && (
          <div>
            <label className={labelCls}>수량</label>
            <input type="number" inputMode="decimal" className={inputCls} value={quantity} onChange={(e) => setQuantity(+e.target.value)} />
          </div>
        )}
      </div>

      {/* 부동산 */}
      {type === 'REAL_ESTATE' && (
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
        </div>
      )}

      {/* 주식 */}
      {type === 'STOCK' && (
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
            <div>
              <label className={labelCls}>월 수령 예상액</label>
              <input type="number" inputMode="decimal" className={inputCls} value={expectedMonthlyPayout} onChange={(e) => setExpectedMonthlyPayout(+e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>연 증가율 (%)</label>
              <input type="number" inputMode="decimal" step="0.1" className={inputCls} value={annualGrowthRate} onChange={(e) => setAnnualGrowthRate(+e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* 예적금 */}
      {type === 'SAVINGS' && (
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
          disabled={createMut.isPending || !name.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </div>
  )
}
