import { useState } from 'react'
import { Trash2, Pencil, Plus } from 'lucide-react'
import { useAddHistory, useUpdateHistory, useDeleteHistory } from '@/hooks/useHistory'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { formatMoney, formatPrice } from '@/lib/utils'
import type { Asset, HistoryItem, StockDetail } from '@/types'

interface Props { asset: Asset }

const isQtyBased = (type: string) => type === 'STOCK' || type === 'PHYSICAL'

export default function HistoryTable({ asset }: Props) {
  const addMut    = useAddHistory(asset.id)
  const updateMut = useUpdateHistory(asset.id)
  const deleteMut = useDeleteHistory(asset.id)

  const [editing, setEditing]     = useState<HistoryItem | null>(null)
  const [delDate, setDelDate]      = useState<string | null>(null)
  const [addMode, setAddMode]      = useState(false)

  // 폼 상태
  const [fDate, setFDate]   = useState('')
  const [fPrice, setFPrice] = useState(0)
  const [fQty, setFQty]     = useState(0)
  const [fVal, setFVal]     = useState(0)

  const qtyBased = isQtyBased(asset.type)
  const currency = (asset.detail as StockDetail | undefined)?.currency ?? 'KRW'
  const sorted   = [...asset.history].sort((a, b) => b.date.localeCompare(a.date))

  const openEdit = (h: HistoryItem) => {
    setEditing(h)
    setAddMode(false)
    setFDate(h.date)
    setFPrice(h.price ?? 0)
    setFQty(h.quantity ?? 0)
    setFVal(h.value ?? 0)
  }

  const openAdd = () => {
    setEditing(null)
    setAddMode(true)
    setFDate(new Date().toISOString().slice(0, 10))
    setFPrice(0); setFQty(asset.quantity ?? 0); setFVal(0)
  }

  const handleSave = () => {
    if (editing) {
      updateMut.mutate({
        date: editing.date,
        data: qtyBased ? { price: fPrice, quantity: fQty } : { value: fVal },
      }, { onSuccess: () => setEditing(null) })
    } else {
      addMut.mutate(
        qtyBased
          ? { date: fDate, price: fPrice, quantity: fQty }
          : { date: fDate, value: fVal },
        { onSuccess: () => setAddMode(false) }
      )
    }
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-300">📝 이력 관리</h4>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus className="w-3 h-3" /> 추가
        </button>
      </div>

      {/* 추가/수정 폼 */}
      {(addMode || editing) && (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-300">
            {editing ? `✏️ 수정 — ${editing.date}` : '➕ 신규 추가'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {!editing && (
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">날짜</label>
                <input
                  type="date"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            {qtyBased ? (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">단가</label>
                  <input
                    type="number" inputMode="decimal" value={fPrice} onChange={(e) => setFPrice(+e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">수량</label>
                  <input
                    type="number" inputMode="decimal" value={fQty} onChange={(e) => setFQty(+e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
                {qtyBased && editing && (
                  <p className="col-span-2 text-xs text-yellow-400">
                    ⚠️ 수량 변경 시 이후 날짜 데이터에도 전파됩니다.
                  </p>
                )}
              </>
            ) : (
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">평가액</label>
                <input
                  type="number" inputMode="decimal" value={fVal} onChange={(e) => setFVal(+e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setEditing(null); setAddMode(false) }}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-600 text-gray-300 hover:bg-gray-500 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={addMut.isPending || updateMut.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* 테이블 */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-y-auto max-h-64">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800 sticky top-0 z-10">
              <th className="text-left px-3 py-2 text-gray-400 font-medium">날짜</th>
              {qtyBased && (
                <>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">단가</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">수량</th>
                </>
              )}
              <th className="text-right px-3 py-2 text-gray-400 font-medium">평가액</th>
              <th className="px-2 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={qtyBased ? 5 : 3} className="text-center py-6 text-gray-500">
                  이력 없음
                </td>
              </tr>
            )}
            {sorted.map((h) => (
              <tr
                key={h.date}
                className="border-t border-gray-700/50 hover:bg-gray-700/30 transition-colors"
              >
                <td className="px-3 py-2 text-gray-300">{h.date}</td>
                {qtyBased && (
                  <>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">
                      {h.price ? formatPrice(h.price, currency) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {h.quantity?.toLocaleString() ?? '-'}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-right text-gray-100 font-medium">
                  {h.value ? formatMoney(h.value) : '-'}
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => openEdit(h)}
                      className="p-2 rounded text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDelDate(h.date)}
                      className="p-2 rounded text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={!!delDate}
        title="이력 삭제"
        message={`${delDate} 데이터를 삭제하시겠습니까?`}
        danger
        onCancel={() => setDelDate(null)}
        onConfirm={() => {
          if (delDate) deleteMut.mutate(delDate, { onSuccess: () => setDelDate(null) })
        }}
      />
    </div>
  )
}
