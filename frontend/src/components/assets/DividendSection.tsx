import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useDividends, useAddDividend, useDeleteDividend, useUpdateDividendSettings } from '@/hooks/useDividends'
import { formatMoney, formatManwon } from '@/lib/utils'
import type { Asset, StockDetail } from '@/types'

const CYCLE_OPTIONS = ['월', '분기', '반기', '연간']
const CYCLE_TIMES: Record<string, number> = { 월: 12, 분기: 4, 반기: 2, 연간: 1 }

interface Props { asset: Asset }

export default function DividendSection({ asset }: Props) {
  const d = asset.detail as StockDetail | undefined
  const currency = d?.currency ?? 'KRW'

  const { data: history = [] } = useDividends(asset.id)
  const addMut     = useAddDividend(asset.id)
  const deleteMut  = useDeleteDividend(asset.id)
  const settingMut = useUpdateDividendSettings(asset.id)

  // 배당 설정 로컬 상태
  const [yld,   setYld]   = useState(String(d?.dividendYield  ?? 0))
  const [dps,   setDps]   = useState(String(d?.dividendDps    ?? 0))
  const [cycle, setCycle] = useState(d?.dividendCycle ?? '연간')

  // 신규 이력 입력 상태
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amountOriginal: '',
    amountKrw: '',
    memo: '',
  })
  const [showForm, setShowForm] = useState(false)

  // 예상 연간 배당금 계산
  const qty   = asset.quantity ?? 0
  const val   = asset.currentValue ?? 0
  const times = CYCLE_TIMES[cycle] ?? 1
  const dpsNum = parseFloat(dps) || 0
  const yldNum = parseFloat(yld) || 0
  const annualKrw = dpsNum > 0
    ? dpsNum * qty * times
    : yldNum > 0 ? val * yldNum / 100 : 0

  const totalReceived = history.reduce((s, r) => s + r.amountKrw, 0)

  const handleSaveSettings = () => {
    settingMut.mutate({ dividendYield: yldNum, dividendDps: dpsNum, dividendCycle: cycle })
  }

  const handleAddHistory = () => {
    const krw = parseFloat(form.amountKrw.replace(/,/g, '')) || 0
    if (!form.date || krw <= 0) return
    addMut.mutate({
      date:           form.date,
      amountKrw:      krw,
      amountOriginal: parseFloat(form.amountOriginal.replace(/,/g, '')) || 0,
      currency,
      exchangeRate:   krw > 0 && parseFloat(form.amountOriginal) > 0
        ? krw / parseFloat(form.amountOriginal)
        : 1,
      memo: form.memo,
    }, {
      onSuccess: () => {
        setForm({ date: new Date().toISOString().slice(0, 10), amountOriginal: '', amountKrw: '', memo: '' })
        setShowForm(false)
      },
    })
  }

  return (
    <div className="space-y-5">

      {/* 예상 배당 설정 */}
      <div className="bg-gray-700/40 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400">📊 배당 설정</p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-gray-500 mb-1">배당수익률 (%)</p>
            <input
              type="number" inputMode="decimal" step="0.01" min="0"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
                focus:outline-none focus:border-blue-500"
              value={yld}
              onChange={(e) => setYld(e.target.value)}
              placeholder="예: 2.5"
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">주당 배당금 (KRW)</p>
            <input
              type="number" inputMode="decimal" min="0"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
                focus:outline-none focus:border-blue-500"
              value={dps}
              onChange={(e) => setDps(e.target.value)}
              placeholder="예: 1200"
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">배당 주기</p>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100
                focus:outline-none focus:border-blue-500"
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
            >
              {CYCLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* 예상 배당금 계산 결과 */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-gray-500">
            {dpsNum > 0
              ? <span>주당 {formatMoney(dpsNum)} × {qty.toLocaleString()}주 × {times}회/년</span>
              : yldNum > 0
              ? <span>평가액 {formatManwon(val)} × {yldNum}%</span>
              : <span className="text-gray-600">배당수익률 또는 주당 배당금을 입력하세요</span>
            }
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-gray-500">연간 예상</p>
              <p className="text-sm font-bold text-blue-400">{formatManwon(annualKrw)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500">월 환산</p>
              <p className="text-sm font-bold text-emerald-400">{formatManwon(annualKrw / 12)}</p>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={settingMut.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </div>

      {/* 수령 이력 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400">💰 수령 이력</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              총 수령 <span className="text-gray-300 font-semibold">{formatManwon(totalReceived)}</span>
            </span>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> 추가
            </button>
          </div>
        </div>

        {/* 입력 폼 */}
        {showForm && (
          <div className="bg-gray-700/40 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">수령일</p>
                <input
                  type="date"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
                    focus:outline-none focus:border-blue-500"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">수령액 (KRW)</p>
                <input
                  type="text" inputMode="numeric"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
                    focus:outline-none focus:border-blue-500 text-right"
                  placeholder="원화 금액"
                  value={form.amountKrw}
                  onChange={(e) => setForm((f) => ({ ...f, amountKrw: e.target.value }))}
                />
              </div>
              {currency !== 'KRW' && (
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">외화 금액 ({currency})</p>
                  <input
                    type="text" inputMode="numeric"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
                      focus:outline-none focus:border-blue-500 text-right"
                    placeholder={`${currency} 금액`}
                    value={form.amountOriginal}
                    onChange={(e) => setForm((f) => ({ ...f, amountOriginal: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">메모</p>
                <input
                  type="text"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100
                    focus:outline-none focus:border-blue-500"
                  placeholder="선택사항"
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-600 hover:bg-gray-500 text-gray-300 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddHistory}
                disabled={addMut.isPending}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
              >
                기록
              </button>
            </div>
          </div>
        )}

        {/* 이력 테이블 */}
        {history.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">수령 이력이 없습니다.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-3 font-medium">날짜</th>
                  <th className="text-right py-2 px-3 font-medium">수령액 (KRW)</th>
                  {history.some((h) => h.currency !== 'KRW') && (
                    <th className="text-right py-2 px-3 font-medium">외화</th>
                  )}
                  <th className="text-left py-2 px-3 font-medium">메모</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-2 px-3 text-gray-400">{h.date}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-100">{formatManwon(h.amountKrw)}</td>
                    {history.some((r) => r.currency !== 'KRW') && (
                      <td className="py-2 px-3 text-right text-gray-500">
                        {h.amountOriginal > 0 ? `${h.amountOriginal.toLocaleString()} ${h.currency}` : '—'}
                      </td>
                    )}
                    <td className="py-2 px-3 text-gray-500">{h.memo || '—'}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => deleteMut.mutate(h.id)}
                        className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
