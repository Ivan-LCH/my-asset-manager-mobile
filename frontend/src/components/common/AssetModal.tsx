import { useEffect } from 'react'
import { X } from 'lucide-react'
import AssetDetail from '@/components/assets/AssetDetail'
import type { Asset } from '@/types'

interface Props {
  asset: Asset | null
  onClose: () => void
}

export default function AssetModal({ asset, onClose }: Props) {
  // ESC 키로 닫기
  useEffect(() => {
    if (!asset) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [asset, onClose])

  if (!asset) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-100">{asset.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {asset.acquisitionDate ?? '-'} 취득
              {asset.disposalDate && <span className="ml-2 text-red-400">· 매각 완료</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 바디 — 스크롤 가능 */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <AssetDetail asset={asset} />
        </div>
      </div>
    </div>
  )
}
