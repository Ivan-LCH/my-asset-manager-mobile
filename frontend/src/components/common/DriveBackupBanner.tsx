// Drive 자동 백업 트리거 + 경과 배너.
// 앱 시작·화면 복귀(visibilitychange→visible) 때 판단한다. 팝업은 절대 자동으로 열지 않고,
// 토큰이 없으면 배너의 [지금 백업] 탭(사용자 제스처)에서 로그인+저장을 한 번에 한다.
import { useCallback, useEffect, useState } from 'react'
import { UploadCloud, X } from 'lucide-react'
import { exportBackup, isDemoDatabase } from '@/lib/db'
import { DriveError, ensureSignedIn, isLoggedIn } from '@/lib/googleDrive'
import {
  BACKUP_STATE_EVENT, backupFingerprint, backupHasData, backupOverdue, daysSinceBackup, decideAutoBackup,
  readBackupState, recordBackupFailure, runAutoBackup,
} from '@/lib/autoBackup'

const CHECK_INTERVAL_MS = 10 * 60_000   // 화면 복귀마다 전체 지문을 계산하지 않도록 최소 간격
let running = false
let lastCheck = 0

export default function DriveBackupBanner() {
  const [banner, setBanner] = useState<{ days: number | null; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [done, setDone] = useState('')

  const check = useCallback(async (force = false) => {
    if (isDemoDatabase || running) return
    const now = new Date(), state = readBackupState()
    if (!backupOverdue(state, now)) { setBanner(null); return }
    if (!force && now.getTime() - lastCheck < CHECK_INTERVAL_MS) return
    running = true; lastCheck = now.getTime()
    try {
      const data = await exportBackup()
      const action = decideAutoBackup({ now, state, tokenValid: isLoggedIn(), fingerprint: backupFingerprint(data), hasData: backupHasData(data) })
      if (action === 'none') { setBanner(null); return }
      if (action === 'banner') { setBanner({ days: daysSinceBackup(state, now), error: state.error }); return }
      try {
        await runAutoBackup(data, now)
        setBanner(null)
      } catch (e) {
        const message = e instanceof Error ? e.message : '자동 백업 실패'
        recordBackupFailure(message, now)
        setBanner({ days: daysSinceBackup(state, now), error: message })
      }
    } catch (e) {
      console.warn('자동 백업 확인 실패', e)
    } finally { running = false }
  }, [])

  useEffect(() => {
    void check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    // 설정 화면의 수동 저장 성공 → 기한이 갱신되면 배너를 바로 숨긴다
    const onState = () => { if (!backupOverdue(readBackupState(), new Date())) setBanner(null) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(BACKUP_STATE_EVENT, onState)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener(BACKUP_STATE_EVENT, onState) }
  }, [check])

  const backupNow = async () => {
    if (busy || running) return
    setBusy(true)
    // 첫 호출이 동기적으로 로그인 팝업을 연다(제스처 유지) — 이 앞에 await 를 두지 않는다
    const signIn = ensureSignedIn()
    running = true
    try {
      await signIn
      const data = await exportBackup()
      const r = await runAutoBackup(data)
      setBanner(null)
      setDone(`Drive 백업 완료: ${r.name}`)
      setTimeout(() => setDone(''), 4000)
    } catch (e) {
      const message = e instanceof Error ? e.message : '백업 실패'
      if (e instanceof DriveError) recordBackupFailure(message)
      setBanner((b) => ({ days: b?.days ?? daysSinceBackup(readBackupState(), new Date()), error: message }))
    } finally { running = false; setBusy(false) }
  }

  if (done) return <div className="bg-emerald-900/70 text-emerald-100 px-4 py-2 text-xs" role="status">{done}</div>
  if (!banner || dismissed) return null
  return (
    <div className="bg-amber-900/70 border-b border-amber-700 text-amber-100 px-4 py-2 text-xs flex items-center gap-3" role="status" data-drive-backup-banner>
      <div className="flex-1 min-w-0">
        <p>{banner.days == null ? 'Drive 백업 기록 없음' : `Drive 백업 ${banner.days}일 경과`} — 데이터는 이 기기에만 있습니다.</p>
        {banner.error && <p className="text-amber-300 break-words">마지막 시도 실패: {banner.error}</p>}
      </div>
      <button onClick={backupNow} disabled={busy}
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50">
        <UploadCloud className="w-3.5 h-3.5" />{busy ? '백업 중...' : '지금 백업'}
      </button>
      <button onClick={() => setDismissed(true)} aria-label="나중에" className="shrink-0 p-1 text-amber-300 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
