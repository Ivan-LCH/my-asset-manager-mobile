// 복원 전 변경 미리보기 — 현재 데이터와 가져올 백업을 테이블별로 비교하는 순수 함수.
// 읽기 전용이며 복원은 여전히 전체 교체만 한다(병합은 보류: ++id 기기별 충돌, 삭제 기록 없음).
import { fingerprint } from '@/planner/model'
import type { BackupData } from './db'

type Row = Record<string, unknown>
export interface TableDiff {
  table: string
  label: string
  added: number
  removed: number
  changed: number
  unchanged: number
  /** 사람이 읽을 이름(자산명·설정 키 등). 표시용으로 앞부분만 잘라 쓴다. */
  addedNames: string[]
  removedNames: string[]
  changedNames: string[]
}
export interface BackupDiff { tables: TableDiff[]; totalChanges: number; identical: boolean }

const DETAIL_TABLES = ['realEstateDetails', 'stockDetails', 'pensionDetails', 'savingsDetails']
export const TABLE_LABELS: Record<string, string> = {
  assets: '자산', assetHistory: '이력', realEstateDetails: '부동산 상세', stockDetails: '주식 상세',
  pensionDetails: '연금 상세', savingsDetails: '예적금 상세', dividendHistory: '배당 기록', settings: '설정',
  plannerPlans: '계획', plannerRuns: '저장된 분석', plannerDrafts: '계획 초안',
}
const ORDER = ['assets', ...DETAIL_TABLES, 'assetHistory', 'dividendHistory', 'settings', 'plannerPlans', 'plannerDrafts', 'plannerRuns']

/** 테이블별 비교 키. 이력·배당의 ++id 는 기기마다 달라 키로 쓰지 않는다. */
function keyOf(table: string, r: Row): string {
  if (table === 'assets' || table.startsWith('planner')) return String(r.id)
  if (DETAIL_TABLES.includes(table)) return String(r.assetId)
  if (table === 'settings') return String(r.key)
  if (table === 'assetHistory') return `${r.assetId}|${r.date}`
  // 배당: 자연 키가 없어 자산·날짜·원화금액으로 근사 (같은 키가 여러 건이면 순서대로 짝지음)
  if (table === 'dividendHistory') return `${r.assetId}|${r.date}|${r.amountKrw}`
  return r.id != null ? String(r.id) : fingerprint(r)
}
/** 내용 비교에서 뺄 필드 — 기기별 자동 증가 id */
function content(table: string, r: Row): string {
  if (table === 'assetHistory' || table === 'dividendHistory') { const { id: _id, ...rest } = r; return fingerprint(rest) }
  return fingerprint(r)
}

export function diffBackup(current: BackupData, incoming: BackupData): BackupDiff {
  const names = new Map<string, string>()
  for (const a of [...(current.tables.assets ?? []), ...(incoming.tables.assets ?? [])] as Row[]) names.set(String(a.id), String(a.name ?? a.id))
  const nameOf = (table: string, r: Row): string => {
    if (table === 'assets') return String(r.name ?? r.id)
    if (DETAIL_TABLES.includes(table) || table === 'assetHistory' || table === 'dividendHistory') return names.get(String(r.assetId)) ?? String(r.assetId)
    if (table === 'settings') return String(r.key)
    return String(r.id ?? '')
  }
  const tableNames = [...new Set([...Object.keys(current.tables), ...Object.keys(incoming.tables)])]
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b))
  const tables: TableDiff[] = []
  for (const table of tableNames) {
    const group = (rows: unknown[] | undefined) => {
      const m = new Map<string, Row[]>()
      for (const r of (rows ?? []) as Row[]) { const k = keyOf(table, r); const list = m.get(k); if (list) list.push(r); else m.set(k, [r]) }
      return m
    }
    const before = group(current.tables[table]), after = group(incoming.tables[table])
    const d: TableDiff = { table, label: TABLE_LABELS[table] ?? table, added: 0, removed: 0, changed: 0, unchanged: 0, addedNames: [], removedNames: [], changedNames: [] }
    const push = (list: string[], name: string) => { if (!list.includes(name)) list.push(name) }
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const b = before.get(key) ?? [], a = after.get(key) ?? []
      const n = Math.min(a.length, b.length)
      // 같은 키 안에서는 내용이 같은 행끼리 먼저 짝짓고, 남은 행을 변경으로 본다
      const bLeft = b.map(r => content(table, r)), aLeft = a.map(r => content(table, r))
      let same = 0
      for (let i = 0; i < aLeft.length; i++) { const j = bLeft.indexOf(aLeft[i]); if (j >= 0) { bLeft.splice(j, 1); same++ } }
      d.unchanged += same
      const changed = n - same
      if (changed > 0) { d.changed += changed; push(d.changedNames, nameOf(table, a[0] ?? b[0])) }
      if (a.length > n) { d.added += a.length - n; push(d.addedNames, nameOf(table, a[0])) }
      if (b.length > n) { d.removed += b.length - n; push(d.removedNames, nameOf(table, b[0])) }
    }
    tables.push(d)
  }
  const totalChanges = tables.reduce((s, t) => s + t.added + t.removed + t.changed, 0)
  return { tables, totalChanges, identical: totalChanges === 0 }
}

/** 이름 목록을 앞 max개 + "외 N" 으로 줄임 */
export function shortList(names: string[], max = 5): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} 외 ${names.length - max}`
}
