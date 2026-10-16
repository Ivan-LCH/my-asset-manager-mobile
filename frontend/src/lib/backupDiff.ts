// 복원 전 변경 미리보기 — 현재 데이터와 가져올 백업을 테이블별로 비교하는 순수 함수.
// 복원 방식: 전체 교체(diffBackup 표시) 또는 병합(planMerge — 백업에만 있는 자산과 그 상세·이력·배당만 추가).
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

// ── 병합 계획 ─────────────────────────────────────────────────
// 현재 데이터는 그대로 두고, 백업에만 있는 자산(id 기준)과 그 자산의 상세·이력·배당만 추가한다.
// id 가 겹치면 현재 값 유지. settings·planner 테이블은 건드리지 않는다(삭제 기록·updatedAt 이 없어 병합 불가).
export const MERGE_TABLES = ['assets', ...DETAIL_TABLES, 'assetHistory', 'dividendHistory']
export interface MergePlan {
  /** 추가할 행 — 테이블별. 이력·배당은 ++id 를 지워 새 id 를 받는다(현재 행과 id 충돌 방지). */
  tables: Record<string, Row[]>
  assetNames: string[]
  /** 추가 행 수 (자산 제외 — 상세·이력·배당) */
  details: number
  history: number
  dividends: number
}

export function planMerge(current: BackupData, incoming: BackupData): MergePlan {
  const have = (table: string, key: string) => new Set(((current.tables[table] ?? []) as Row[]).map(r => String(r[key])))
  const existingAssets = have('assets', 'id')
  const newAssets = ((incoming.tables.assets ?? []) as Row[]).filter(a => !existingAssets.has(String(a.id)))
  const newIds = new Set(newAssets.map(a => String(a.id)))
  const tables: Record<string, Row[]> = { assets: newAssets }
  let details = 0
  for (const table of DETAIL_TABLES) {
    // 상세는 assetId 가 기본 키 — 이미 있으면(고아 상세라도) 현재 값 유지
    const existing = have(table, 'assetId')
    tables[table] = ((incoming.tables[table] ?? []) as Row[]).filter(r => newIds.has(String(r.assetId)) && !existing.has(String(r.assetId)))
    details += tables[table].length
  }
  for (const table of ['assetHistory', 'dividendHistory']) {
    // 현재 DB에 같은 자산의 고아 행(같은 자연 키)이 남아 있으면 현재 행 유지
    const existing = new Set(((current.tables[table] ?? []) as Row[]).map(r => keyOf(table, r)))
    tables[table] = ((incoming.tables[table] ?? []) as Row[])
      .filter(r => newIds.has(String(r.assetId)) && !existing.has(keyOf(table, r)))
      .map(({ id: _id, ...rest }) => rest)
  }
  return {
    tables, assetNames: newAssets.map(a => String(a.name ?? a.id)), details,
    history: tables.assetHistory.length, dividends: tables.dividendHistory.length,
  }
}
