// 복원 확인 모달 — 복원 방식(덮어쓰기/병합)을 고르고, 방식별 변경 미리보기를 확인한 뒤 실행.
import { useEffect, useState } from 'react'
import { shortList, type BackupDiff, type MergePlan } from '@/lib/backupDiff'

export type RestoreMode = 'overwrite' | 'merge'

export interface RestoreRequest {
  source:   string
  summary:  string
  warnings: string[]
  diff:     BackupDiff
  merge:    MergePlan
}

export default function RestoreDiffDialog({ request, busy, onConfirm, onCancel }: {
  request:   RestoreRequest | null
  busy?:     boolean
  onConfirm: (mode: RestoreMode) => void
  onCancel:  () => void
}) {
  const [mode, setMode] = useState<RestoreMode>('overwrite')
  // 새 미리보기마다 기본값(덮어쓰기)으로
  useEffect(() => { setMode('overwrite') }, [request])
  if (!request) return null
  const { diff, merge } = request
  const assets = diff.tables.find(t => t.table === 'assets')
  const rows = diff.tables.filter(t => t.added || t.removed || t.changed)
  const mergeCount = merge.assetNames.length
  const disabled = busy || (mode === 'merge' && mergeCount === 0)
  const option = (value: RestoreMode, title: string, desc: string) => (
    <label className={`flex gap-2 p-2 rounded-lg border cursor-pointer ${mode === value ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'}`}>
      <input type="radio" name="restore-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={busy} className="mt-0.5" />
      <span className="text-xs"><span className="block text-sm text-gray-100">{title}</span><span className="text-gray-400">{desc}</span></span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" data-restore-diff>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl space-y-3">
        <h3 className="text-base font-semibold text-gray-100">백업 가져오기</h3>
        <p className="text-xs text-gray-400 break-words">파일: {request.source}</p>

        <fieldset className="space-y-2" data-restore-mode>
          <legend className="text-xs text-gray-400 mb-1">복원 방식</legend>
          {option('overwrite', '덮어쓰기 (전체 교체)', '현재 데이터 전체를 지우고 백업 내용으로 바꿉니다. 백업에 없는 자산·이력·설정·계획은 사라집니다.')}
          {option('merge', '병합 (없는 자산만 추가)', '현재 데이터는 그대로 두고, 백업에만 있는 자산과 그 상세·이력·배당만 추가합니다. 이미 있는 자산은 현재 값을 유지하고, 설정·계획은 바꾸지 않습니다.')}
        </fieldset>

        {mode === 'overwrite' ? (
          diff.identical ? (
            <p className="text-sm text-emerald-300">현재 데이터와 내용이 같습니다. 교체해도 바뀌는 것이 없습니다.</p>
          ) : (
            <>
              <p className="text-sm text-gray-200">변경 {diff.totalChanges.toLocaleString()}건</p>
              <table className="w-full text-xs text-gray-300">
                <thead><tr className="text-gray-500"><th className="text-left font-normal py-1">항목</th><th className="text-right font-normal">추가</th><th className="text-right font-normal">삭제</th><th className="text-right font-normal">변경</th><th className="text-right font-normal">동일</th></tr></thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.table} className="border-t border-gray-700/60">
                      <td className="py-1">{t.label}</td>
                      <td className="text-right text-emerald-400">{t.added || ''}</td>
                      <td className="text-right text-red-400">{t.removed || ''}</td>
                      <td className="text-right text-amber-300">{t.changed || ''}</td>
                      <td className="text-right text-gray-500">{t.unchanged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assets && (assets.addedNames.length > 0 || assets.removedNames.length > 0 || assets.changedNames.length > 0) && (
                <div className="text-xs space-y-1 break-words">
                  {assets.addedNames.length > 0 && <p className="text-emerald-400">추가될 자산: {shortList(assets.addedNames)}</p>}
                  {assets.removedNames.length > 0 && <p className="text-red-400">사라질 자산: {shortList(assets.removedNames)}</p>}
                  {assets.changedNames.length > 0 && <p className="text-amber-300">바뀔 자산: {shortList(assets.changedNames)}</p>}
                </div>
              )}
            </>
          )
        ) : mergeCount === 0 ? (
          <p className="text-sm text-emerald-300">백업에만 있는 자산이 없습니다. 병합해도 추가되는 것이 없습니다.</p>
        ) : (
          <div className="text-xs space-y-1 break-words" data-merge-preview>
            <p className="text-sm text-gray-200">자산 {mergeCount.toLocaleString()}개 추가</p>
            <p className="text-emerald-400">추가될 자산: {shortList(merge.assetNames)}</p>
            <p className="text-gray-400">함께 추가: 상세 {merge.details} · 이력 {merge.history.toLocaleString()} · 배당 {merge.dividends.toLocaleString()}건</p>
          </div>
        )}

        {request.warnings.length > 0 && (
          <div className="text-xs text-amber-300 space-y-0.5">
            <p className="font-medium">확인 필요</p>
            {request.warnings.map(w => <p key={w}>· {w}</p>)}
          </div>
        )}
        <details className="text-xs text-gray-400"><summary className="cursor-pointer">백업 요약</summary><p className="mt-1 whitespace-pre-wrap break-words">{request.summary}</p></details>
        <p className="text-xs text-gray-500">어느 방식이든 실행 직전 사본이 이 브라우저에 보관되어 "마지막 복원 직전으로 되돌리기"로 되돌릴 수 있습니다.</p>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50">취소</button>
          <button onClick={() => onConfirm(mode)} disabled={disabled}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50 ${mode === 'overwrite' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {busy ? '적용 중...' : mode === 'overwrite' ? '덮어쓰기 실행' : `자산 ${mergeCount}개 병합`}
          </button>
        </div>
      </div>
    </div>
  )
}
