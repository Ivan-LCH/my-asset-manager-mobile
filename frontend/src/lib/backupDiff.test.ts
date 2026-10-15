import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { diffBackup, shortList } from './backupDiff'
import { db, importBackup, previewBackup, type BackupData } from './db'

// @types/node 미설치 — node:fs 는 최소 타입으로 동적 import (phase1-backup.test.ts 와 동일)
const { existsSync, readFileSync } = (await import('node:fs' as string)) as {
  existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string
}
// 실제 백업 파일(저장소 밖, 있을 때만). 내용은 출력하지 않고 건수만 비교한다.
const REAL = '/workspace/asset-analysis/asset-manager-backup-2026-10-14-fixed.json'
const loadReal = () => JSON.parse(readFileSync(REAL, 'utf8').replace(/^﻿/, '')) as BackupData
const byTable = (d: ReturnType<typeof diffBackup>, t: string) => d.tables.find(x => x.table === t)!

function synthetic(): BackupData {
  return {
    app: 'asset_manager_m', version: 2, exportedAt: '2026-10-15T00:00:00Z',
    tables: {
      assets: [{ id: 'a1', name: '삼성전자', type: 'STOCK', currentValue: 100 }, { id: 'a2', name: 'SCHD', type: 'STOCK', currentValue: 200 }],
      stockDetails: [{ assetId: 'a1', ticker: '005930.KS' }, { assetId: 'a2', ticker: 'SCHD' }],
      assetHistory: [{ id: 1, assetId: 'a1', date: '2026-10-01', value: 100 }, { id: 2, assetId: 'a2', date: '2026-10-01', value: 200 }],
      dividendHistory: [{ id: 1, assetId: 'a2', date: '2026-09-30', amountKrw: 5000, memo: '' }, { id: 2, assetId: 'a2', date: '2026-09-30', amountKrw: 5000, memo: '' }],
      settings: [{ key: 'exchange_rate_USD', value: '1500' }],
      plannerPlans: [{ id: 'main', plan: {} }],
    },
  }
}

describe('diffBackup', () => {
  it('같은 백업끼리는 변경 없음', () => {
    const d = diffBackup(synthetic(), synthetic())
    expect(d.identical).toBe(true)
    expect(d.totalChanges).toBe(0)
    expect(byTable(d, 'assets').unchanged).toBe(2)
  })

  it('기기별 ++id 차이는 변경이 아님 (이력은 [assetId+date], 배당은 근사 키)', () => {
    const b = synthetic()
    b.tables.assetHistory = (b.tables.assetHistory as any[]).map(r => ({ ...r, id: r.id + 100 }))
    b.tables.dividendHistory = (b.tables.dividendHistory as any[]).map(r => ({ ...r, id: r.id + 100 })).reverse()
    expect(diffBackup(synthetic(), b).identical).toBe(true)
  })

  it('추가·삭제·변경을 테이블별로 세고 자산명을 보여 줌', () => {
    const b = synthetic()
    b.tables.assets = [{ id: 'a1', name: '삼성전자', type: 'STOCK', currentValue: 150 }, { id: 'a3', name: 'QQQM', type: 'STOCK', currentValue: 1 }]
    b.tables.stockDetails = [{ assetId: 'a1', ticker: '005930.KS' }, { assetId: 'a3', ticker: 'QQQM' }]
    b.tables.assetHistory = [{ id: 9, assetId: 'a1', date: '2026-10-01', value: 150 }, { id: 10, assetId: 'a1', date: '2026-10-02', value: 150 }]
    b.tables.dividendHistory = [{ id: 1, assetId: 'a2', date: '2026-09-30', amountKrw: 5000, memo: '' }]
    b.tables.settings = [{ key: 'exchange_rate_USD', value: '1400' }, { key: 'new_key', value: '1' }]
    const d = diffBackup(synthetic(), b)
    expect(byTable(d, 'assets')).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 0, addedNames: ['QQQM'], removedNames: ['SCHD'], changedNames: ['삼성전자'] })
    expect(byTable(d, 'stockDetails')).toMatchObject({ added: 1, removed: 1, changed: 0, unchanged: 1 })
    expect(byTable(d, 'assetHistory')).toMatchObject({ added: 1, removed: 1, changed: 1 })
    expect(byTable(d, 'dividendHistory')).toMatchObject({ removed: 1, unchanged: 1 })
    expect(byTable(d, 'settings')).toMatchObject({ added: 1, changed: 1, addedNames: ['new_key'], changedNames: ['exchange_rate_USD'] })
    expect(d.identical).toBe(false)
    expect(d.tables[0].table).toBe('assets')
  })

  it('한쪽에만 있는 테이블(v1 백업의 planner 없음)도 비교', () => {
    const b = synthetic(); delete b.tables.plannerPlans
    expect(byTable(diffBackup(synthetic(), b), 'plannerPlans')).toMatchObject({ removed: 1, label: '계획' })
  })

  it('이름 목록 줄임', () => {
    expect(shortList(['a', 'b'])).toBe('a, b')
    expect(shortList(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5)).toBe('a, b, c, d, e 외 2')
  })

  describe.skipIf(!existsSync(REAL))('실제 백업 파일', () => {
    it('자기 자신과 비교하면 변경 없음', () => {
      const d = diffBackup(loadReal(), loadReal())
      expect(d.identical).toBe(true)
      expect(byTable(d, 'assets').unchanged).toBeGreaterThan(0)
      expect(byTable(d, 'assetHistory').unchanged).toBe(loadReal().tables.assetHistory.length)
    })
    it('수정본과 비교하면 수정한 만큼만 변경', () => {
      const cur = loadReal(), mod = loadReal()
      const assets = mod.tables.assets as any[]
      const renamed = assets[0], removed = assets[assets.length - 1]
      renamed.name = renamed.name + ' (수정)'
      mod.tables.assets = assets.filter(a => a !== removed)
      const history = mod.tables.assetHistory as any[]
      const removedHistory = history.filter(h => h.assetId === removed.id).length
      mod.tables.assetHistory = history.filter(h => h.assetId !== removed.id)
      ;(mod.tables.assetHistory as any[]).push({ assetId: renamed.id, date: '2099-01-01', value: 1 })
      ;(mod.tables.settings as any[]).push({ key: 'phase3_test_key', value: 'x' })
      const d = diffBackup(cur, mod)
      expect(byTable(d, 'assets')).toMatchObject({ added: 0, removed: 1, changed: 1, removedNames: [removed.name], changedNames: [renamed.name] })
      expect(byTable(d, 'assetHistory')).toMatchObject({ added: 1, removed: removedHistory, changed: 0 })
      expect(byTable(d, 'settings')).toMatchObject({ added: 1, removed: 0, changed: 0 })
      // 손대지 않은 나머지 테이블은 변경 없음
      for (const t of d.tables.filter(t => !['assets', 'assetHistory', 'settings'].includes(t.table))) {
        expect(t, t.table).toMatchObject({ added: 0, changed: 0, removed: 0 })
      }
      expect(d.totalChanges).toBe(2 + 1 + removedHistory + 1)
    })
    it('가져온 뒤 같은 파일을 다시 미리보기하면 변경 없음 (previewBackup 경로)', async () => {
      await Promise.all(db.tables.map(t => t.clear()))
      const p = await previewBackup(loadReal())
      await importBackup(p.data, p.expected, 'test')
      const again = await previewBackup(loadReal())
      expect(again.diff.identical).toBe(true)
    })
  })
})
