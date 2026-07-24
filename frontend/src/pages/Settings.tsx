import { useState, useEffect, useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings, useSaveSettings } from '@/hooks/useSettings'
import { exportBackup, importBackup, clearAllData, seedSampleData, type BackupData } from '@/lib/db'
import { resolveAge, nationalPensionStartYear, hasSpouse } from '@/lib/people'

export default function Settings() {
  const { data: settings, isLoading } = useSettings()
  const saveMut = useSaveSettings()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [birthHusband,   setBirthHusband]   = useState('1972.03')
  const [birthWife,      setBirthWife]      = useState('')
  const [retirementYear, setRetirementYear] = useState(new Date().getFullYear() + 10)
  const [saved,          setSaved]          = useState(false)
  const [backupMsg,      setBackupMsg]      = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setBirthHusband(settings.birthHusband ?? '1972.03')
      setBirthWife(settings.birthWife ?? '')
      setRetirementYear(settings.retirementYear ?? new Date().getFullYear() + 10)
    }
  }, [settings])

  const handleSave = () => {
    saveMut.mutate({ birthHusband, birthWife, retirementYear }, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  const inputCls = 'bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 w-36'
  // 미리보기: 현재 나이 · 65세(국민연금 개시) 연도
  const preview = { birthHusband, birthWife }

  // ── 데이터 백업/복원 (M-3) ──
  const handleExport = async () => {
    try {
      const data = await exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `asset-manager-backup-${data.exportedAt.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setBackupMsg({ ok: true, text: '내보내기 완료' })
    } catch {
      setBackupMsg({ ok: false, text: '내보내기 실패' })
    }
    setTimeout(() => setBackupMsg(null), 3000)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // 같은 파일 재선택 허용
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as BackupData
      await importBackup(data)
      await qc.invalidateQueries()   // 모든 쿼리 갱신
      setBackupMsg({ ok: true, text: '가져오기 완료 (화면 새로고침 권장)' })
    } catch (err) {
      setBackupMsg({ ok: false, text: err instanceof Error ? err.message : '가져오기 실패' })
    }
    setTimeout(() => setBackupMsg(null), 4000)
  }

  // ── 샘플 데이터 / 전체 삭제 ──
  const handleLoadSample = async () => {
    try {
      await seedSampleData()   // 내부에서 clearAllData 후 시드
      await qc.invalidateQueries()
      setBackupMsg({ ok: true, text: '샘플 데이터를 불러왔습니다' })
    } catch {
      setBackupMsg({ ok: false, text: '샘플 불러오기 실패' })
    }
    setTimeout(() => setBackupMsg(null), 3000)
  }

  const handleClearAll = async () => {
    try {
      await clearAllData()
      await qc.invalidateQueries()
      setBackupMsg({ ok: true, text: '모든 데이터를 삭제했습니다' })
    } catch {
      setBackupMsg({ ok: false, text: '삭제 실패' })
    }
    setTimeout(() => setBackupMsg(null), 3000)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-100">⚙️ 설정</h2>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-300">연금 시뮬레이션 기준</h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">남편 생년월 (예: 1972.03)</label>
            <input
              type="text" inputMode="decimal" placeholder="1972.03"
              className={inputCls}
              value={birthHusband}
              onChange={(e) => setBirthHusband(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              현재 {resolveAge(preview)}세 · 65세(국민연금 개시) {nationalPensionStartYear(birthHusband) ?? '-'}년
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">와이프 생년월 (비우면 미혼 가정)</label>
            <input
              type="text" inputMode="decimal" placeholder="비우면 미혼"
              className={inputCls}
              value={birthWife}
              onChange={(e) => setBirthWife(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {hasSpouse(preview)
                ? `와이프 65세(국민연금) ${nationalPensionStartYear(birthWife)}년`
                : '미혼(단독)으로 가정 — 와이프 연금·명의 없음'}
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">은퇴 예정 연도</label>
            <input
              type="number" inputMode="decimal"
              className={inputCls}
              value={retirementYear}
              onChange={(e) => setRetirementYear(+e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            저장
          </button>
          {saved && <span className="text-xs text-emerald-400">저장되었습니다.</span>}
        </div>
      </div>

      {/* 시세 자동 가져오기 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-2">
        <h3 className="text-sm font-semibold text-gray-300">📈 시세 자동 가져오기</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          주식 페이지의 "시세 업데이트" 버튼으로 종목 단가를 자동 반영합니다.
          배포(Vercel) 환경에서는 서버리스 함수가, 개발 중에는 로컬 서버가 Yahoo Finance 에서 가져옵니다.
          자동 실패 시 수동 입력란으로 직접 채울 수 있습니다.
        </p>
      </div>

      {/* 데이터 백업 / 복원 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">데이터 백업 / 복원</h3>
          <p className="text-xs text-gray-500 mt-1">
            데이터는 이 폰에만 저장됩니다. 폰 교체·초기화 전에 내보내기 해두세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" />
            내보내기 (JSON)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            <Upload className="w-4 h-4" />
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        {backupMsg && (
          <p className={`text-xs ${backupMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{backupMsg.text}</p>
        )}
        <p className="text-[11px] text-gray-600">가져오기·샘플 불러오기는 기존 데이터를 모두 덮어씁니다.</p>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
          <button
            onClick={handleLoadSample}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors"
          >
            샘플 데이터 불러오기
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-sm rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors"
          >
            모든 데이터 삭제
          </button>
        </div>
      </div>
    </div>
  )
}
