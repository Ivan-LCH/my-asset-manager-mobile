// Drive 자동 백업 — 앱이 열려 있고 이번 세션의 토큰이 유효할 때만 동작(PWA는 닫혀 있으면 실행 불가).
// 상태는 localStorage(drive_last_backup) — settings 테이블은 백업·복원 대상이라 기기별 상태를 두지 않는다.
import { fingerprint } from '@/planner/model'
import type { BackupData } from './db'
import { deleteDriveFile, listBackupFiles, saveToDrive, type DriveFile } from './googleDrive'

export const AUTO_BACKUP_PREFIX = 'asset-manager-backup-auto-'
export const AUTO_BACKUP_DAYS = 3
export const AUTO_BACKUP_KEEP = 3
/** 앱이 만든 자동 백업 표시(appProperties). 이름만 같은 수동 업로드 파일은 삭제 대상이 아니다. */
export const AUTO_BACKUP_PROPERTY = { assetManagerAuto: '1' }
const STATE_KEY = 'drive_last_backup'
const DAY_MS = 86_400_000

export interface DriveBackupState {
  at?: string           // 마지막 성공 시각
  fileId?: string
  fingerprint?: string  // 마지막 성공 백업의 데이터 지문
  error?: string        // 마지막 실패 메시지 (성공 시 제거)
  errorAt?: string
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
const browserStorage = (): Storage | null => typeof localStorage !== 'undefined' ? localStorage : null

export function readBackupState(storage: Storage | null = browserStorage()): DriveBackupState {
  try { const v = JSON.parse(storage?.getItem(STATE_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
/** 상태 변경 알림 이벤트 — 배너가 수동 저장 결과를 바로 반영하도록. */
export const BACKUP_STATE_EVENT = 'drive-backup-state'
export function writeBackupState(state: DriveBackupState, storage: Storage | null = browserStorage()) {
  try { storage?.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* 저장 공간 부족 등은 무시 */ }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event(BACKUP_STATE_EVENT))
}

/** 마지막 성공 이후 경과 일수(정수, 내림). 기록이 없으면 null. */
export function daysSinceBackup(state: DriveBackupState, now: Date): number | null {
  const t = state.at ? Date.parse(state.at) : NaN
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : null
}

/** 마지막 성공이 N일보다 오래됐거나 기록이 없으면 true. */
export function backupOverdue(state: DriveBackupState, now: Date, days = AUTO_BACKUP_DAYS): boolean {
  const t = state.at ? Date.parse(state.at) : NaN
  return !Number.isFinite(t) || now.getTime() - t > days * DAY_MS
}

export type AutoBackupAction = 'none' | 'upload' | 'banner'
/** 자동 백업 판단 (순수 함수).
 *  기한 내이거나 데이터가 없거나 지난 백업과 내용이 같으면 none,
 *  아니면 유효 토큰이 있을 때 upload, 없으면 banner(사용자 탭 = 로그인 제스처). */
export function decideAutoBackup(input: {
  now: Date; state: DriveBackupState; tokenValid: boolean; fingerprint: string; hasData: boolean; days?: number
}): AutoBackupAction {
  if (!backupOverdue(input.state, input.now, input.days)) return 'none'
  if (!input.hasData) return 'none'
  if (input.state.fingerprint && input.state.fingerprint === input.fingerprint) return 'none'
  return input.tokenValid ? 'upload' : 'banner'
}

export const isAutoBackupFile = (f: Pick<DriveFile, 'name' | 'appProperties'>) =>
  f.name.startsWith(AUTO_BACKUP_PREFIX) && f.appProperties?.assetManagerAuto === AUTO_BACKUP_PROPERTY.assetManagerAuto

/** 보존 정책: 앱이 만든 자동 백업만 최신 keep개 남기고 나머지를 삭제 대상으로 반환. 수동·외부 파일은 건드리지 않는다. */
export function selectAutoBackupsToDelete(files: DriveFile[], keep = AUTO_BACKUP_KEEP, protectId?: string): DriveFile[] {
  const autos = files.filter(isAutoBackupFile)
    .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') || b.name.localeCompare(a.name))
  return autos.slice(Math.max(0, keep)).filter(f => f.id !== protectId)
}

export function autoBackupFileName(exportedAt: string): string {
  const t = new Date(exportedAt)
  if (!Number.isFinite(t.getTime())) throw new Error('백업 생성 시각이 올바르지 않습니다.')
  return `${AUTO_BACKUP_PREFIX}${t.toISOString().replace(/[:.]/g, '-')}.json`
}

export const backupFingerprint = (data: BackupData) => fingerprint(data.tables)
export const backupHasData = (data: BackupData) =>
  (data.tables.assets?.length ?? 0) > 0 || (data.tables.plannerPlans?.length ?? 0) > 0

/** 성공한 Drive 백업(수동 포함)을 기록 — 배너·자동 백업 판단의 기준. */
export function recordBackupSuccess(data: BackupData, fileId: string, now = new Date(), storage: Storage | null = browserStorage()) {
  writeBackupState({ at: now.toISOString(), fileId, fingerprint: backupFingerprint(data) }, storage)
}
export function recordBackupFailure(message: string, now = new Date(), storage: Storage | null = browserStorage()) {
  writeBackupState({ ...readBackupState(storage), error: message, errorAt: now.toISOString() }, storage)
}

/** 자동 백업 1회 실행: 업로드 → 상태 기록 → 오래된 자동 백업 정리. 업로드 실패는 throw.
 *  폴더를 주지 않으므로 saveToDrive 가 앱 백업 폴더(수동 백업과 같은 곳)에 저장하고, listBackupFiles 도 그 폴더만 본다. */
export async function runAutoBackup(data: BackupData, now = new Date()): Promise<{ id: string; name: string; pruned: number }> {
  const saved = await saveToDrive(JSON.stringify(data), undefined, { fileName: autoBackupFileName(data.exportedAt), appProperties: AUTO_BACKUP_PROPERTY })
  recordBackupSuccess(data, saved.id, now)
  // 정리 실패는 백업 성공을 되돌리지 않는다(다음 실행 때 다시 정리)
  let pruned = 0
  try {
    for (const f of selectAutoBackupsToDelete(await listBackupFiles(), AUTO_BACKUP_KEEP, saved.id)) { await deleteDriveFile(f.id); pruned++ }
  } catch (e) { console.warn('오래된 자동 백업 정리 실패', e) }
  return { ...saved, pruned }
}
