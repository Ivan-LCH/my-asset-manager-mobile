// 4단계 db.ts 분리 — 공개 API 고정 (분리 전 목록을 스냅샷)
// 값 export 는 런타임 키로, 타입 export 는 아래 type-only 참조로 tsc(npm run build)가 검증한다.
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import type * as Db from '@/lib/db'

// 분리 전(2f0aa47) `Object.keys(await import('@/lib/db')).sort()`
const VALUE_EXPORTS = [
  'AssetDB', 'FALLBACK_RATES', 'addDividend', 'addHistory', 'applyPriceHistory', 'applyQuoteObservation',
  'applyStockPriceCorrection', 'backfillStockPrices', 'beginQuoteRequest', 'clearAllData', 'createAsset', 'db',
  'deleteAsset', 'deleteHistory', 'exportBackup', 'getAllAssets', 'getAssetById', 'getChartData', 'getCorpSim',
  'getDividendSummary', 'getDividends', 'getExchangeRate', 'getHistory', 'getLastBackupImport', 'getPensionSim',
  'getPortfolio', 'getRetirement', 'getSettings', 'getStockAccountOwnership', 'importBackup', 'isDemoDatabase',
  'mergeBackup', 'migrateBackfillHistory', 'migrateInflowsToLumpsumAndAllocations', 'migrateSettingsToBirth',
  'migrateStockOwnershipToAccount', 'previewBackup', 'previewStockPriceCorrection', 'removeDividend',
  'renameStockAccount', 'restorePreviousImport', 'saveCorpSim', 'savePensionSim', 'savePortfolio', 'saveRetirement',
  'saveSettings', 'saveStockAccountOwnership', 'seedSampleData', 'undoStockPriceCorrection', 'updateAsset',
  'updateDividendSettings', 'updateHistory',
]

// 타입 export — 하나라도 빠지면 tsc 실패
export type DbTypeExports = [
  Db.AssetRow, Db.HistoryRow, Db.RealEstateRow, Db.StockRow, Db.PensionRow, Db.SavingsRow,
  Db.DividendRow, Db.SettingRow, Db.BackupData, Db.PriceCorrectionPreview, Db.AssetDB,
]

describe('@/lib/db 공개 API', () => {
  it('값 export 목록이 분리 전과 같다 (키 상수 등 내부 값 비노출)', async () => {
    expect(Object.keys(await import('@/lib/db')).sort()).toEqual(VALUE_EXPORTS)
  })

  it('비데모 DB 이름·스키마 버전 불변', async () => {
    const { db, isDemoDatabase } = await import('@/lib/db')
    expect(isDemoDatabase).toBe(false)
    expect(db.name).toBe('asset_manager_m')
    expect(db.verno).toBe(2)
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'assetHistory', 'assets', 'dividendHistory', 'pensionDetails', 'plannerDrafts', 'plannerPlans',
      'plannerRecovery', 'plannerRuns', 'realEstateDetails', 'savingsDetails', 'settings', 'stockDetails',
    ])
    const schema = Object.fromEntries(db.tables.map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(',')]))
    expect(schema).toEqual({
      assets: 'id,type', assetHistory: '++id,assetId,[assetId+date]', realEstateDetails: 'assetId',
      stockDetails: 'assetId', pensionDetails: 'assetId', savingsDetails: 'assetId',
      dividendHistory: '++id,assetId,date', settings: 'key',
      plannerPlans: 'id', plannerRuns: 'id,createdAt', plannerDrafts: 'id', plannerRecovery: 'id,createdAt',
    })
  })
})
