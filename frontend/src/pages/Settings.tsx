import MigrationReview from '@/planner/MigrationReview'
import {pensionRegistrationSummary,registerPensionPlan} from '@/lib/registerPensionPlan'
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Download, Upload, Cloud, CloudOff, FolderOpen, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSettings, useSaveSettings } from '@/hooks/useSettings'
import { exportBackup, importBackup, previewBackup, restorePreviousImport, clearAllData, previewStockPriceCorrection, applyStockPriceCorrection, undoStockPriceCorrection, getLastBackupImport, type BackupData } from '@/lib/db'
import {backupFileName,backupSummary} from '@/lib/backupInfo'
import { resolveAge, nationalPensionStartYear, hasSpouse } from '@/lib/people'
import { googleSignIn, logout, isLoggedIn, saveToDrive, listBackupFiles, loadFromDrive, pickFolder } from '@/lib/googleDrive'

export default function Settings() {
  const { data: settings, isLoading } = useSettings()
  const saveMut = useSaveSettings()
  const qc = useQueryClient()
  const {data:lastImport}=useQuery({queryKey:['backup-import-info'],queryFn:getLastBackupImport})
  const fileRef = useRef<HTMLInputElement>(null)

  const [birthHusband,   setBirthHusband]   = useState('')
  const [birthWife,      setBirthWife]      = useState('')
  const [retirementYear, setRetirementYear] = useState(new Date().getFullYear() + 10)
  const [saved,          setSaved]          = useState(false)
  const [backupMsg,      setBackupMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  // Google Drive 상태
  const [gDriveLoggedIn, setGDriveLoggedIn] = useState(isLoggedIn())
  const [driveFolder,    setDriveFolder]    = useState<{ id: string; name: string } | null>(null)
  const [driveFiles,     setDriveFiles]     = useState<{ id: string; name: string; modifiedTime: string }[]>([])
  const [driveLoading,   setDriveLoading]   = useState(false)
  // 과거 시세 소급 업데이트 상태
  const [priceBackfill, setPriceBackfill] = useState<{
    running: boolean; done: boolean; ok: boolean; msg: string
  }>({ running: false, done: false, ok: false, msg: '' })

  useEffect(() => {
    if (settings) {
      setBirthHusband(settings.birthHusband ?? '')
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

  // ── 과거 시세 소급 업데이트 — 보유 주식 최근 3개월 실제 종가로 덮어쓰기 ──
  const handleBackfillPrices = async () => {
    if (priceBackfill.running) return
    setPriceBackfill({ running: true, done: false, ok: false, msg: '준비 중...' })
    try {
      const preview = await previewStockPriceCorrection(3, (done,total) => setPriceBackfill({running:true,done:false,ok:false,msg:`${done} / ${total}종목 확인 중`}))
      const additions=preview.additions??[]
      const summary=`추가 ${additions.length}건 · 보정 ${preview.changes.length}건 · 동일 ${preview.unchanged??0}건 · 수량 근거 없음 ${preview.missingQuantity??0}건 · 외화/계좌합계 제외 ${preview.excluded??0}종목`
      if (!preview.changes.length && !additions.length) {
        setPriceBackfill({running:false,done:true,ok:preview.failed.length===0,msg:preview.failed.length ? `시세 조회 실패 ${preview.failed.length}종목 · ${summary}. 다시 시도해 주세요.` : `조회 완료 — ${summary}. ${preview.checked ? '새로 추가하거나 보정할 시세가 없습니다.' : '과거 수량 기록이 없어 채울 수 있는 날짜가 없습니다.'}`}); return;
      }
      if (!window.confirm(`최근 3개월의 빈 거래일을 채우고 기존 시세를 보정합니다. 현재 평가액·수량은 변경하지 않습니다.\n범위: ${preview.from} ~ ${preview.to} 전날\n${summary}\n조회 실패: ${preview.failed.join(', ') || '없음'}\n\n추가 날짜의 수량은 직전 기록 유지 가정이며 이력에 추정으로 표시됩니다. 취득 전·수량 근거 없는 날·휴장일은 만들지 않습니다.\n${additions.slice(0,6).map(h=>`${h.date}: 추가 · 수량 ${h.quantity} (${h.quantitySourceDate} 기준)`).join('\n')}\n${preview.changes.slice(0,6).map(c=>`${c.before.date}: 단가 ${c.before.price} → ${c.after.price}`).join('\n')}\n\n반영할까요? 이번 추가와 보정은 함께 되돌릴 수 있습니다.`)) {setPriceBackfill({running:false,done:true,ok:true,msg:'미리보기 취소 — 변경 없음'});return}
      await applyStockPriceCorrection(preview)
      const r = {assets:preview.assets,failed:preview.failed,updated:preview.changes.length+additions.length}
      await qc.invalidateQueries()
      const failNote = r.failed.length > 0 ? ` · 실패: ${r.failed.join(', ')}` : ''
      setPriceBackfill({
        running: false, done: true, ok: r.updated > 0,
        msg: r.updated > 0
          ? `완료 — ${summary}${failNote}`
          : `반영된 시세가 없습니다 (조회 실패 또는 이력 없음)${failNote}`,
      })
    } catch (e) {
      setPriceBackfill({
        running: false, done: true, ok: false,
        msg: e instanceof Error ? e.message : '실패했습니다',
      })
    }
  }

  // ── 데이터 백업/복원 (M-3) ──
  const handleExport = async () => {
    try {
      const data = await exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = backupFileName(data.exportedAt)
      a.click()
      URL.revokeObjectURL(url)
      setBackupMsg({ ok: true, text: '내보내기 완료: '+a.download+'\n'+backupSummary(data) })
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
      const data = JSON.parse(text.replace(/^\uFEFF/,'')) as BackupData
      if((data as unknown as {kind?:string}).kind==='pension-plan-registration'){
        if(!window.confirm('연금 계획만 적용\n'+pensionRegistrationSummary(data)+'\n\n적용할까요?'))return
        const message=await registerPensionPlan(data)
        await qc.invalidateQueries()
        setBackupMsg({ok:true,text:message+' 분석 → 개인투자시뮬에서 등록한 연금 계획을 확인하세요.'})
        return
      }
      const preview = await previewBackup(data)
      if (!window.confirm('파일: '+file.name+'\n검증된 백업으로 현재 데이터 전체를 교체합니다. 원본 이력을 자동 보간하지 않습니다.\n'+preview.summary+'\n\n진행할까요? 직전 사본은 이 브라우저에 보관합니다.')) return
      await importBackup(preview.data, preview.expected,file.name)
      await qc.invalidateQueries()   // 모든 쿼리 갱신
      setBackupMsg({ ok: true, text: '가져오기 완료: '+file.name+'\n'+backupSummary(preview.data) })
    } catch (err) {
      setBackupMsg({ ok: false, text: err instanceof Error ? err.message : '가져오기 실패' })
    }
    setTimeout(() => setBackupMsg(null), 4000)
  }

  // ── 샘플 데이터 / 전체 삭제 ──
  const handleLoadSample = async () => {
    window.open('/?demo=1', '_blank', 'noopener')
  }

  const handleClearAll = async () => {
    if (!window.confirm('실제 자산·계획·분석·복구 사본을 모두 삭제합니다. 별도 백업이 없으면 복구할 수 없습니다. 계속할까요?')) return
    try {
      await clearAllData()
      await qc.invalidateQueries()
      setBackupMsg({ ok: true, text: '모든 데이터를 삭제했습니다' })
    } catch {
      setBackupMsg({ ok: false, text: '삭제 실패' })
    }
    setTimeout(() => setBackupMsg(null), 3000)
  }

  // ── Google Drive ──
  const handleGDriveLogin = async () => {
    try {
      setDriveLoading(true)
      await googleSignIn()
      setGDriveLoggedIn(true)
      const files = await listBackupFiles()
      setDriveFiles(files)
      setBackupMsg({ ok: true, text: 'Google Drive 연결됨' })
    } catch (e) {
      setBackupMsg({ ok: false, text: e instanceof Error ? e.message : '로그인 실패' })
    }
    setDriveLoading(false)
    setTimeout(() => setBackupMsg(null), 3000)
  }

  const handleGDriveSave = async () => {
    try {
      setDriveLoading(true)
      const data = await exportBackup()
      const json = JSON.stringify(data, null, 2)
      const result = await saveToDrive(json, driveFolder?.id)
      const files = await listBackupFiles()
      setDriveFiles(files)
      setBackupMsg({ ok: true, text: `Drive에 저장됨: ${result.name}` })
    } catch (e) {
      setBackupMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    }
    setDriveLoading(false)
    setTimeout(() => setBackupMsg(null), 4000)
  }

  const handleGDriveLoad = async (fileId: string) => {
    try {
      setDriveLoading(true)
      const json = await loadFromDrive(fileId)
      const data = JSON.parse(json.replace(/^\uFEFF/,'')) as BackupData
      const preview = await previewBackup(data)
      if (!window.confirm('Drive 백업으로 전체 교체:\n'+preview.summary+'\n진행할까요?')) { setDriveLoading(false); return }
      await importBackup(preview.data, preview.expected,'Drive: '+(driveFiles.find(f=>f.id===fileId)?.name??'백업 파일'))
      await qc.invalidateQueries()
      setBackupMsg({ ok: true, text: 'Drive에서 복원 완료 (새로고침 권장)' })
    } catch (e) {
      setBackupMsg({ ok: false, text: e instanceof Error ? e.message : '복원 실패' })
    }
    setDriveLoading(false)
    setTimeout(() => setBackupMsg(null), 4000)
  }

  const handlePickFolder = async () => {
    const folder = await pickFolder()
    if (folder) {
      setDriveFolder(folder)
      setBackupMsg({ ok: true, text: `폴더 선택: ${folder.name}` })
      setTimeout(() => setBackupMsg(null), 3000)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-100">⚙️ 설정</h2>
      <p className="text-sm text-gray-300">새 계획의 구성원·은퇴일·물가 가정은 <Link className="underline text-blue-300" to="/plan">계획 화면</Link>에서 관리합니다. 여기는 백업·외부 연결·기존 도구 설정입니다.</p>
      <details className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-5">
        <summary className="text-sm font-semibold text-gray-300 cursor-pointer">기존 참고 계산기 인물 설정 (새 계획과 별도)</summary>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">남편 생년월 (예: 1980.05)</label>
            <input
              type="text" inputMode="decimal" placeholder="예: 1980.05"
              className={inputCls}
              value={birthHusband}
              onChange={(e) => setBirthHusband(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              {birthHusband
                ? `현재 ${resolveAge(preview)}세 · 65세 가정 참고연도 ${nationalPensionStartYear(birthHusband) ?? '-'}년 (실제 개시일은 계획에서 확인)`
                : '입력하면 나이·시뮬레이션에 반영됩니다.'}
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
            <p className="text-xs text-gray-500 mt-1">
              {hasSpouse(preview)
                ? `배우자 65세 가정 참고연도 ${nationalPensionStartYear(birthWife)}년 (실제 수급요건 판정 아님)`
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
      </details>

      {/* 시세 자동 가져오기 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-2">
        <h3 className="text-sm font-semibold text-gray-300">📈 시세 자동 가져오기</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          주식 페이지의 "시세 업데이트" 버튼으로 종목 단가를 자동 반영합니다.
          자동 실패 시 수동 입력란으로 직접 채울 수 있습니다.
        </p>
      </div>

      {/* Google Drive 백업 */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">☁️ Google Drive 백업</h3>
          <p className="text-xs text-gray-500 mt-1">
            Google 계정으로 로그인 → 본인 Drive에 백업 저장/복원. 폰 교체 시 같은 계정으로 복원.
          </p>
        </div>
        {!gDriveLoggedIn ? (
          <button
            onClick={handleGDriveLogin}
            disabled={driveLoading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            <Cloud className="w-4 h-4" />
            Google 계정으로 로그인
          </button>
        ) : (
          <div className="space-y-3">
            {/* 폴더 선택 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePickFolder}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                폴더 선택
              </button>
              <span className="text-xs text-gray-400">
                {driveFolder ? `📁 ${driveFolder.name}` : '내 Drive 루트'}
              </span>
              <button
                onClick={() => { logout(); setGDriveLoggedIn(false); setDriveFolder(null); setDriveFiles([]) }}
                className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300"
              >
                <CloudOff className="w-3.5 h-3.5" /> 로그아웃
              </button>
            </div>
            {/* 저장 */}
            <button
              onClick={handleGDriveSave}
              disabled={driveLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
            >
              <Cloud className="w-4 h-4" />
              {driveLoading ? '저장 중...' : 'Drive에 저장'}
            </button>
            {/* 백업 파일 목록 */}
            {driveFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Drive 백업 파일 ({driveFiles.length}개)</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {driveFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => handleGDriveLoad(f.id)}
                      className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-gray-300 truncate">{f.name}</span>
                      <span className="text-gray-600 shrink-0">{f.modifiedTime?.slice(0, 10)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={async () => { const files = await listBackupFiles(); setDriveFiles(files) }}
              disabled={driveLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 새로고침
            </button>
          </div>
        )}
      </div>

      <MigrationReview />
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
          <p className={`text-xs whitespace-pre-wrap break-words ${backupMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{backupMsg.text}</p>
        )}
        <p className="text-xs text-gray-400">가져오기는 검증·확인 후 전체 교체합니다. 샘플은 별도 저장소에서 열립니다. 소스 ZIP에는 이 브라우저의 개인 자산이 포함되지 않습니다.</p>
        <p className="text-xs text-gray-400">저장된 IRP 재원·합산·목돈 연결, 개인별/연도별 세금 추가정보, 소급 시세와 수량 추정 근거도 백업에 포함됩니다. 편집 중인 값은 해당 화면에서 먼저 저장하세요. 내보낸 파일을 만드는 것만으로 다른 브라우저에 적용되지는 않습니다.</p>
        {lastImport&&<details className="rounded border border-gray-700 p-3 text-xs" data-last-backup-import><summary className="cursor-pointer text-blue-300">이 브라우저에 마지막으로 가져온 백업</summary><p className="mt-2 break-words">파일: {lastImport.sourceName}</p><p>가져온 시각: {new Date(lastImport.importedAt).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words">{lastImport.summary}</p><p className="mt-2 text-gray-400">가져올 당시의 기록입니다. 이후 저장한 변경은 다음 내보내기에 포함됩니다. 복구용 사본·가져오기 기록 자체는 다른 브라우저로 옮기지 않습니다.</p></details>}
        <button className="text-sm text-blue-300 underline p-3" onClick={() => { if (window.confirm('마지막 복원 직전 사본으로 되돌릴까요? 현재 데이터도 직전 사본으로 교체 보관됩니다.')) void restorePreviousImport().then(() => qc.invalidateQueries()).then(() => setBackupMsg({ok:true,text:'직전 사본 복구 완료'})).catch(e => setBackupMsg({ok:false,text:String(e)})) }}>마지막 복원 직전으로 되돌리기</button>
        <button className="text-sm text-blue-300 underline p-3" onClick={() => {if(window.confirm('마지막 과거 시세 보정만 되돌릴까요?'))void undoStockPriceCorrection().then(()=>qc.invalidateQueries()).then(()=>setBackupMsg({ok:true,text:'시세 보정 되돌리기 완료'})).catch(e=>setBackupMsg({ok:false,text:String(e)}))}}>마지막 과거 시세 보정 되돌리기</button>

        {/* 최근 3개월 실제 시세 소급 반영 */}
        <details className="border-t border-gray-700 pt-3 space-y-2" data-price-correction><summary className="cursor-pointer text-sm text-gray-300 py-3">과거 기록 보정 · 필요한 경우에만</summary>
          <div>
            <h4 className="text-sm font-semibold text-gray-300">🕒 과거 시세 소급 업데이트</h4>
            <p className="text-xs text-gray-500 mt-1">
              최근 3개월의 빈 거래일을 채우고 기존 가격도 보정합니다. 추가 날짜의 수량은 직전 기록 유지 가정으로 표시합니다. 휴장일·취득 전·수량 근거 없는 날은 만들지 않습니다. 외화·계좌합계·오늘은 제외하며 현재 평가액은 그대로 유지합니다.
            </p>
          </div>
          <button
            onClick={handleBackfillPrices}
            disabled={priceBackfill.running}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
          >
            {priceBackfill.running
              ? `조회 중... ${priceBackfill.msg}`
              : '최근 3개월 시세 소급 업데이트'}
          </button>
          {priceBackfill.done && !priceBackfill.running && (
            <p className={`text-xs ${priceBackfill.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {priceBackfill.msg}
            </p>
          )}
        </details>
        <p className="text-xs text-gray-700">앱 빌드: {__BUILD_TIME__} — 이 시각이 오래됐으면 새로고침(앱 완전 종료 후 재실행)으로 업데이트하세요.</p>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
          <button
            onClick={handleLoadSample}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white transition-colors"
          >
            샘플 전용 화면 열기
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
