// ──────────────────────────────────────────────────────────────
// 로컬 저장소(IndexedDB/Dexie) 공개 API
//
// 4단계에서 구현을 lib/store/* 로 나눴다. 앱·테스트는 계속 '@/lib/db' 만 import 한다.
// 재노출은 명시 목록으로만 한다(export * 금지) — 분리 전과 같은 값·타입만 공개하고,
// store 내부 공유용 키 상수(RETIREMENT_KEY 등)·레거시 변환 함수는 공개하지 않는다.
// 목록은 lib/dbExports.test.ts 스냅샷으로 고정되어 있다.
//
// store 모듈 계층 (아래가 위를 import):
//   schema → exchangeRate → settings·assets → history → legacyPlans
//   → plans·quotes·dividends·backupIO·priceCorrection·stockAccounts → seed·migrations
// ──────────────────────────────────────────────────────────────

// 스키마·DB 인스턴스 (데모 판정 → DB 이름 선택 순서는 schema.ts 안에서 유지)
export { AssetDB, db, isDemoDatabase } from './store/schema'
export type {
  AssetRow, HistoryRow, RealEstateRow, StockRow, PensionRow, SavingsRow, DividendRow, SettingRow,
} from './store/schema'

// 환율
export { FALLBACK_RATES, getExchangeRate } from './store/exchangeRate'

// 설정 (KV)
export { getSettings, saveSettings } from './store/settings'

// 자산 CRUD
export { getAllAssets, getAssetById, createAsset, updateAsset, deleteAsset } from './store/assets'

// 이력 · 차트
export { getHistory, addHistory, updateHistory, deleteHistory, getChartData } from './store/history'

// settings JSON 계획 (은퇴·법인·연금 시뮬·포트폴리오)
export {
  getRetirement, saveRetirement, getCorpSim, saveCorpSim, getPensionSim, savePensionSim, getPortfolio, savePortfolio,
} from './store/plans'

// 시세 관측
export { beginQuoteRequest, applyQuoteObservation } from './store/quotes'

// 배당
export { getDividends, addDividend, removeDividend, updateDividendSettings, getDividendSummary } from './store/dividends'

// 백업 / 복원 / 전체 삭제
export {
  exportBackup, previewBackup, importBackup, mergeBackup, getLastBackupImport, restorePreviousImport, clearAllData,
} from './store/backupIO'
export type { BackupData } from './store/backupIO'

// 샘플 데이터
export { seedSampleData } from './store/seed'

// 주식 계좌 명의·이름 변경
export { getStockAccountOwnership, saveStockAccountOwnership, renameStockAccount } from './store/stockAccounts'

// 과거 종가 소급·시세 보정
export {
  applyPriceHistory, backfillStockPrices, previewStockPriceCorrection, applyStockPriceCorrection, undoStockPriceCorrection,
} from './store/priceCorrection'
export type { PriceCorrectionPreview } from './store/priceCorrection'

// 일회성 마이그레이션 (현재 미호출 — 보관)
export {
  migrateStockOwnershipToAccount, migrateInflowsToLumpsumAndAllocations, migrateBackfillHistory, migrateSettingsToBirth,
} from './store/migrations'
