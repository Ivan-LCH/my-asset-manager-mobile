import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import AssetDetail from '@/components/assets/AssetDetail'
import type { Asset } from '@/types'

interface Props {
  asset: Asset | null
  onClose: () => void
}

export default function AssetModal({ asset, onClose }: Props) {
  const location=useLocation()
  const dialog=useRef<HTMLDivElement>(null)
  const close=useRef(onClose);close.current=onClose
  // ESC 키로 닫기
  useEffect(() => {
    if (!asset) return
    const previous=document.activeElement as HTMLElement|null
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key === 'Tab') {
        const focusable=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0)
        const first=focusable[0],last=focusable[focusable.length-1]
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
      }
    }
    window.addEventListener('keydown', handler)
    return () => {window.removeEventListener('keydown', handler);previous?.focus()}
  }, [asset?.id])

  if (!asset) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={asset.name+' 상세'} className="relative w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col bg-gray-900 border-0 sm:border border-gray-700 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden">
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
            aria-label="상세 닫기"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 바디 — 스크롤 가능 */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <Link className="inline-block py-3 text-blue-300 underline" to={'/plan?tab=policies&focus='+encodeURIComponent(asset.id)+'&returnTo='+encodeURIComponent(location.pathname+location.search)} onClick={onClose}>이 자산의 분석 연결·인출 조건 →</Link>
          <AssetDetail asset={asset} />
          {asset.type==='PENSION'&&<Link className="inline-block py-3 text-blue-300" to={'/plan?tab=flows&asset='+encodeURIComponent(asset.id)+'&returnTo='+encodeURIComponent(location.pathname+location.search)} onClick={onClose}>이 연금의 지급 계획 연결 →</Link>}
        </div>
      </div>
    </div>
  )
}
