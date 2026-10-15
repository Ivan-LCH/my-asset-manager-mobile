// 1단계 — 실데이터 백업(2026-10-14-fixed) 회귀 테스트. 파일이 없으면 skip.
// importBackup → loadContext 로 실제 앱과 같은 경로를 거쳐 홈·대시보드·연금·주식 계좌 KPI·가져오기 경고를 확인한다.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, importBackup, previewBackup, getAllAssets, getChartData, getSettings, getDividendSummary, FALLBACK_RATES } from '@/lib/db'
import { stockSummary } from '@/lib/stockSummary'
import type { Asset, StockDetail } from '@/types'
import { stockAccounts } from './accounts'
import { loadContext } from './storage'
import { excludedSummary, formatEok, snapshotTotals } from './totals'

// @types/node 미설치 — node:fs 는 최소 타입으로 동적 import
const { existsSync, readFileSync } = (await import('node:fs' as string)) as {
  existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string
}
const BACKUP = '/workspace/asset-analysis/asset-manager-backup-2026-10-14-fixed.json'
const load = () => JSON.parse(readFileSync(BACKUP, 'utf8').replace(/^﻿/, ''))
const won = (v: number) => Math.round(v).toLocaleString('ko-KR')

describe.skipIf(!existsSync(BACKUP))('실데이터 백업 (2026-10-14-fixed)', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('홈 합계 == 대시보드 합계 == 2,648,608,701 (국민연금 포함) · 제외 항목 없음 · 차트 마지막 값 == 순자산', async () => {
    await importBackup(load())
    const ctx = await loadContext()
    // 홈(PlannerHome)·CurrentOverview·/history Dashboard·연금 탭 모두 snapshotTotals(usePlanner().data.current) 사용
    const home = snapshotTotals(ctx.current)
    const dashboard = snapshotTotals((await loadContext()).current)
    // /history 성장 차트 — 앱과 같은 getChartData 경로, 마지막 날짜의 유형별 값 합
    const chart = await getChartData({ period: 'all', group_by: 'type' })
    const lastDate = chart.reduce((d, p) => p.date > d ? p.date : d, '')
    const chartLast = chart.filter(p => p.date === lastDate).reduce((s, p) => s + p.value, 0)
    console.log(`[phase1] 홈 총자산=${won(home.total)} (${formatEok(home.total)}) · 대시보드 총자산=${won(dashboard.total)}`)
    console.log(`[phase1] 부채=${won(home.debt)} · 순자산=${won(home.net)} · 연금 합산=${won(home.byType.PENSION ?? 0)} · byType=${JSON.stringify(home.byType)}`)
    console.log(`[phase1] 차트 마지막(${lastDate})=${won(chartLast)} · 제외 항목=${excludedSummary(home.excluded) || '(없음)'}`)

    expect(home.total).toBe(2_648_608_701)
    expect(home.debt).toBe(160_000_000)
    expect(home.net).toBe(2_488_608_701)
    expect(dashboard.total).toBe(home.total)
    expect(dashboard.byType).toEqual(home.byType)
    expect(home.byType.PENSION).toBe(154_810_000)
    expect(home.excluded).toEqual([])
    expect(excludedSummary(home.excluded)).toBe('')
    // 엔진 시작 잔액은 그대로 0 (지급 일정과 이중 계상 방지)
    expect(ctx.current.positions.find(p => p.name === '이창호-국민연금')?.balance).toBe(0)
    expect(chartLast).toBe(home.net)
  }, 60_000)

  it('주식 계좌 필터: 이창호-미래에셋-퇴직IRP KPI 250.41M (전체 436.25M 아님)', async () => {
    await importBackup(load())
    const ctx = await loadContext(), settings = await getSettings(), divs = await getDividendSummary()
    const stocks = (await getAllAssets('STOCK')).filter(a => !a.disposalDate)
    const rate = (c?: string) => !c || c === 'KRW' ? 1 : (settings[`exchange_rate_${c}`] as number) ?? FALLBACK_RATES[c] ?? 1
    const costOf = (a: Asset) => (a.acquisitionPrice ?? 0) * (a.quantity ?? 0) * rate((a.detail as StockDetail | undefined)?.currency)
    const irp = stockAccounts(stocks).find(g => g.name.includes('퇴직IRP'))!
    const all = stockSummary(stocks, null, costOf, ctx.current.positions, divs.items)
    const scoped = stockSummary(stocks, irp.name, costOf, ctx.current.positions, divs.items)
    console.log(`[phase1] 주식 전체 평가=${won(all.val)} 손익=${won(all.pnl)} · ${irp.name} 평가=${won(scoped.val)} 손익=${won(scoped.pnl)} 배당=${won(scoped.dividend ?? 0)}`)

    expect(Math.round(all.val / 1e4)).toBe(43625)
    expect(Math.round(scoped.val / 1e4)).toBe(25041)
    expect(Math.round(scoped.pnl / 1e4)).toBe(-3606)
    expect(scoped.dividend ?? 0).toBeLessThanOrEqual(all.dividend ?? 0)
  }, 60_000)

  it('previewBackup: 0026-02-05 주입 시 경고, importBackup 은 그대로 성공', async () => {
    const data = load()
    const target = (data.tables.assets as any[]).find(a => a.name === 'KODEX AI전력핵심설비')
    expect(target).toBeTruthy()
    target.acquisitionDate = '0026-02-05'
    const hist = (data.tables.assetHistory as any[]).filter(h => h.assetId === target.id).sort((a, b) => a.date.localeCompare(b.date))[0]
    hist.date = '0026-02-05'

    const preview = await previewBackup(data)
    console.log(`[phase1] 가져오기 입력 경고 ${preview.inputWarnings.length}건\n` + preview.inputWarnings.map(w => '  · ' + w).join('\n'))
    expect(preview.inputWarnings).toContainEqual(expect.stringMatching(/^KODEX AI전력핵심설비: 취득일.*0026-02-05/))
    expect(preview.inputWarnings).toContainEqual(expect.stringMatching(/^KODEX AI전력핵심설비: 이력 날짜 1건.*0026-02-05/))
    expect(preview.inputWarnings).toContainEqual(expect.stringMatching(/TIGER 미국나스닥100: 같은 계좌/))
    expect(preview.inputWarnings.some(w => /국민연금|퇴직IRP-미래에셋|퇴직연금-미래에셋/.test(w))).toBe(false)   // 수급권·연결 항목 오탐 없음
    expect(preview.summary).toContain('확인 필요')

    await expect(importBackup(preview.data, preview.expected)).resolves.toBeUndefined()
    expect((await db.assets.get(target.id))?.acquisitionDate).toBe('0026-02-05')
  }, 60_000)
})
