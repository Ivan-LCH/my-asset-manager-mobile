import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_BACKUP_PREFIX, autoBackupFileName, bannerText, backupFingerprint, backupHasData, backupOverdue, daysSinceBackup,
  decideAutoBackup, isAutoBackupFile, readBackupState, recordBackupFailure, recordBackupSuccess, selectAutoBackupsToDelete,
} from './autoBackup'
import type { BackupData } from './db'
import type { DriveFile } from './googleDrive'

const NOW = new Date('2026-10-15T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const base = { now: NOW, tokenValid: true, fingerprint: 'fp-new', hasData: true }

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

describe('자동 백업 판단', () => {
  it('3일 이내 성공이면 아무것도 안 함', () => {
    expect(decideAutoBackup({ ...base, state: { at: daysAgo(2.9), fingerprint: 'old' } })).toBe('none')
  })
  it('3일 경과 + 데이터 변경 + 유효 토큰 → upload', () => {
    expect(decideAutoBackup({ ...base, state: { at: daysAgo(3.1), fingerprint: 'old' } })).toBe('upload')
  })
  it('기록이 없으면 경과로 본다', () => {
    expect(decideAutoBackup({ ...base, state: {} })).toBe('upload')
  })
  it('토큰이 없으면 banner (팝업 자동 실행 금지)', () => {
    expect(decideAutoBackup({ ...base, tokenValid: false, state: { at: daysAgo(10), fingerprint: 'old' } })).toBe('banner')
  })
  it('경과했어도 마지막 백업과 내용이 같으면 none', () => {
    expect(decideAutoBackup({ ...base, tokenValid: false, state: { at: daysAgo(10), fingerprint: 'fp-new' } })).toBe('none')
  })
  it('데이터가 비어 있으면 none (새 사용자에게 배너 없음)', () => {
    expect(decideAutoBackup({ ...base, hasData: false, state: {} })).toBe('none')
  })
  it('경과 일수·기한', () => {
    expect(daysSinceBackup({}, NOW)).toBeNull()
    expect(daysSinceBackup({ at: daysAgo(4.5) }, NOW)).toBe(4)
    expect(backupOverdue({ at: daysAgo(3) }, NOW)).toBe(false)
    expect(backupOverdue({ at: 'garbage' }, NOW)).toBe(true)
  })
})

describe('보존 정책 (최신 K=3 자동 백업만 유지)', () => {
  const auto = (id: string, t: string): DriveFile => ({ id, name: `${AUTO_BACKUP_PREFIX}${t}.json`, modifiedTime: t, appProperties: { assetManagerAuto: '1' } })
  const files: DriveFile[] = [
    auto('a1', '2026-10-01'), auto('a5', '2026-10-05'), auto('a3', '2026-10-03'), auto('a4', '2026-10-04'), auto('a2', '2026-10-02'),
    { id: 'manual', name: 'asset-manager-backup-2026-09-01T00-00-00-000Z.json', modifiedTime: '2026-09-01' },
    { id: 'fake-auto', name: `${AUTO_BACKUP_PREFIX}2020.json`, modifiedTime: '2020-01-01' },   // 이름만 같은 외부 파일
    { id: 'fixed', name: 'asset-manager-backup-2026-10-15-fixed.json', modifiedTime: '2026-10-15' },
  ]
  it('오래된 자동 백업만 삭제 대상, 수동·외부 파일은 제외', () => {
    expect(selectAutoBackupsToDelete(files).map(f => f.id)).toEqual(['a2', 'a1'])
  })
  it('K 이하이면 삭제 없음, 방금 올린 파일은 보호', () => {
    expect(selectAutoBackupsToDelete(files.slice(0, 3))).toEqual([])
    expect(selectAutoBackupsToDelete(files, 0, 'a5').map(f => f.id)).toEqual(['a4', 'a3', 'a2', 'a1'])
  })
  it('자동 백업 식별은 이름 접두사 + appProperties 둘 다', () => {
    expect(isAutoBackupFile(files[0])).toBe(true)
    expect(isAutoBackupFile(files[6])).toBe(false)
  })
  it('자동 백업 파일명', () => {
    expect(autoBackupFileName('2026-10-15T01:02:03.004Z')).toBe('asset-manager-backup-auto-2026-10-15T01-02-03-004Z.json')
    expect(() => autoBackupFileName('x')).toThrow()
  })
})

describe('상태 저장 (localStorage)', () => {
  const data = (assets: unknown[]): BackupData => ({ app: 'asset_manager_m', version: 2, exportedAt: NOW.toISOString(), tables: { assets, plannerPlans: [] } })
  it('성공 기록은 지문 포함, 실패 기록은 기존 성공 정보를 보존', () => {
    const s = memoryStorage(), d = data([{ id: 'x' }])
    recordBackupSuccess(d, 'file-1', NOW, s)
    expect(readBackupState(s)).toEqual({ at: NOW.toISOString(), fileId: 'file-1', fingerprint: backupFingerprint(d) })
    recordBackupFailure('Drive 저장 실패: 권한', NOW, s)
    expect(readBackupState(s)).toMatchObject({ fileId: 'file-1', error: 'Drive 저장 실패: 권한' })
    recordBackupSuccess(d, 'file-2', NOW, s)
    expect(readBackupState(s).error).toBeUndefined()
  })
  it('지문은 exportedAt 과 무관하고 데이터가 바뀌면 달라짐', () => {
    const a = data([{ id: 'x' }]), b = { ...data([{ id: 'x' }]), exportedAt: '2030-01-01T00:00:00Z' }
    expect(backupFingerprint(a)).toBe(backupFingerprint(b))
    expect(backupFingerprint(a)).not.toBe(backupFingerprint(data([{ id: 'y' }])))
    expect(backupHasData(data([]))).toBe(false)
    expect(backupHasData(a)).toBe(true)
  })
})

describe('runAutoBackup (모의 Drive)', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('./googleDrive') })
  it('업로드 → 상태 기록 → 오래된 자동 백업 정리, 정리 실패는 백업 실패가 아님', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const deleted: string[] = []
    vi.doMock('./googleDrive', () => ({
      saveToDrive: vi.fn(async (_json: string, _folder: unknown, opts: { fileName: string; appProperties: Record<string, string> }) => {
        expect(opts.fileName.startsWith(AUTO_BACKUP_PREFIX)).toBe(true)
        expect(opts.appProperties).toEqual({ assetManagerAuto: '1' })
        return { id: 'new', name: opts.fileName }
      }),
      listBackupFiles: vi.fn(async () => ['new', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: `${AUTO_BACKUP_PREFIX}${id}.json`, modifiedTime: `2026-10-${15 - i}`, appProperties: { assetManagerAuto: '1' } }))),
      deleteDriveFile: vi.fn(async (id: string) => { if (id === 'e') throw new Error('403'); deleted.push(id) }),
    }))
    const { runAutoBackup, readBackupState: read } = await import('./autoBackup')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await runAutoBackup({ app: 'asset_manager_m', version: 2, exportedAt: NOW.toISOString(), tables: { assets: [{ id: 'x' }] } }, NOW)
    expect(r.id).toBe('new')
    expect(deleted).toEqual(['d'])
    expect(read().fileId).toBe('new')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('bannerText', () => {
  it('기록 없음 / N일 경과 문구를 구분 (Drive 사본 존재 여부를 정확히)', () => {
    expect(bannerText(null)).toBe('이 기기에서 Drive로 백업한 기록이 없습니다 — 지금 백업으로 사본을 만들 수 있습니다.')
    expect(bannerText(5)).toBe('Drive 백업 5일 경과 — 그 뒤 변경 내용은 Drive에 없습니다.')
    expect(bannerText(0)).toContain('0일 경과')
  })
})
