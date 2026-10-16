import { validateBackup } from '@/planner/backup'
import { fingerprint } from '@/planner/model'
import {backupSummary,backupReplacementWarnings} from '../backupInfo'
import { diffBackup, planMerge, shortList, MERGE_TABLES } from '../backupDiff'
import { backupWarnings, seoulToday } from '../validation'
import { db } from './schema'

// ──────────────────────────────────────────────────────────────
// 백업 / 복원 (M-3) · 전체 삭제
// 로컬(IndexedDB) 저장 데이터를 JSON 으로 내보내기/가져오기.
// 폰 교체·앱 데이터 삭제 대비. 모든 테이블을 통째로 직렬화한다.
// ──────────────────────────────────────────────────────────────
export interface BackupData {
  app:         'asset_manager_m'
  version:     1 | 2
  exportedAt:  string
  tables:      Record<string, unknown[]>
}

/** 모든 테이블 스냅샷 → 백업 객체 */
export async function exportBackup(): Promise<BackupData> {
  return db.transaction('r', db.tables, async () => {
    const tables: Record<string, unknown[]> = {}
    for (const t of db.tables.filter(t => t.name !== 'plannerRecovery')) tables[t.name] = await t.toArray()
    return { app: 'asset_manager_m', version: 2, exportedAt: new Date().toISOString(), tables }
  })
}

/** 가져오기 미리보기 — 검증·경고·전체 교체 diff·병합 계획. 쓰기 없음. */
export async function previewBackup(data: unknown) {
  const validated = validateBackup(data), current = await exportBackup()
  // 입력값 경고(날짜 범위·0원 미처분·계좌/티커 중복)는 가져오기를 막지 않고 확인 창에 목록으로만 보여준다
  const inputWarnings=backupWarnings(validated.tables,seoulToday())
  const warnings=[...backupReplacementWarnings(current,validated),...inputWarnings]
  // 변경 미리보기 — 같은 스키마 정규화를 거친 현재 데이터와 비교(검증 실패 시 원본 그대로)
  let normalized:BackupData=current
  try{normalized=validateBackup(current)}catch{/* 현재 데이터가 검증을 통과하지 못해도 미리보기는 계속 */}
  const diff=diffBackup(normalized,validated)
  // 병합 미리보기 — mergeBackup 과 같은 계획(현재 DB 원본 기준)
  const merge=planMerge(current,validated)
  return { data: validated, expected: fingerprint(current.tables), warnings, inputWarnings, diff, merge, summary:backupSummary(validated)+(warnings.length?'\n\n확인 필요:\n'+warnings.join('\n'):'') }
}
/** 백업 객체 → 기존 데이터 전체 교체(모든 테이블 clear 후 bulkAdd) */
export async function importBackup(data: BackupData, expected?: string, sourceName?:string): Promise<void> {
  const validated = validateBackup(data)
  await db.transaction('rw', db.tables, async () => {
    const previous = await exportBackup()
    if (expected && expected !== fingerprint(previous.tables)) throw new Error('미리보기 이후 데이터가 변경되었습니다. 다시 검토해 주세요.')
    await db.table('plannerRecovery').put({ id: 'before-import', createdAt: new Date().toISOString(), backup: previous })
    for (const t of db.tables.filter(t => t.name !== 'plannerRecovery')) {
      await t.clear()
      const rows = validated.tables[t.name]
      if (rows && rows.length > 0) await t.bulkAdd(rows as Record<string, unknown>[])
    }
    await db.table('plannerRecovery').put({id:'last-import',sourceName:sourceName??'백업 파일',importedAt:new Date().toISOString(),exportedAt:validated.exportedAt,summary:backupSummary(validated)})
  })
}
/** 병합 가져오기 — 현재 데이터는 그대로 두고 백업에만 있는 자산(+상세·이력·배당)만 추가. 추가한 자산 수 반환.
 *  settings·planner 테이블은 건드리지 않는다. 추가할 것이 없으면 아무것도 쓰지 않는다(직전 사본도 유지). */
export async function mergeBackup(data: BackupData, expected?: string, sourceName?: string): Promise<number> {
  const validated = validateBackup(data)
  return db.transaction('rw', db.tables, async () => {
    const previous = await exportBackup()
    if (expected && expected !== fingerprint(previous.tables)) throw new Error('미리보기 이후 데이터가 변경되었습니다. 다시 검토해 주세요.')
    const plan = planMerge(previous, validated)
    if (plan.assetNames.length === 0) return 0
    await db.table('plannerRecovery').put({ id: 'before-import', createdAt: new Date().toISOString(), backup: previous })
    for (const name of MERGE_TABLES) {
      const rows = plan.tables[name]
      if (rows?.length) await db.table(name).bulkAdd(rows)
    }
    const summary = `병합: 백업에만 있는 자산 ${plan.assetNames.length}개 추가 (${shortList(plan.assetNames)}) · 상세 ${plan.details} · 이력 ${plan.history} · 배당 ${plan.dividends}건. 기존 자산·설정·계획은 그대로.\n\n백업 파일 내용:\n${backupSummary(validated)}`
    await db.table('plannerRecovery').put({ id: 'last-import', sourceName: sourceName ?? '백업 파일', importedAt: new Date().toISOString(), exportedAt: validated.exportedAt, summary })
    return plan.assetNames.length
  })
}
export async function getLastBackupImport():Promise<{sourceName:string;importedAt:string;exportedAt:string;summary:string}|null>{
  return (await db.table('plannerRecovery').get('last-import'))??null
}
export async function restorePreviousImport() {
  const row = await db.table('plannerRecovery').get('before-import')
  if (!row) throw new Error('이 브라우저에 복원 직전 사본이 없습니다.')
  await importBackup(row.backup,undefined,'직전 사본 복구')
}

/** 모든 테이블 비우기 */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
}
