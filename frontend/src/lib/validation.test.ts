// 1단계 — 입력 검증 (날짜 범위·0원 미처분·계좌/티커 중복)
import { describe, it, expect } from 'vitest'
import { accountModeError, assetDateErrors, assetWarnings, backupWarnings, checkAsset, dateError, findDuplicateStock, seoulToday } from './validation'

const TODAY = '2026-10-15'

describe('dateError', () => {
  it('1900-01-01 ~ 오늘 범위만 허용, 빈 값은 통과', () => {
    expect(dateError('', TODAY)).toBeNull()
    expect(dateError(undefined, TODAY)).toBeNull()
    expect(dateError('1900-01-01', TODAY)).toBeNull()
    expect(dateError(TODAY, TODAY)).toBeNull()
    expect(dateError('0026-02-05', TODAY)).toMatch(/1900-01-01 이전/)
    expect(dateError('1899-12-31', TODAY)).toMatch(/1900-01-01 이전/)
    expect(dateError('2026-10-16', TODAY)).toMatch(/오늘/)
  })
  it('allowFuture: 미래는 허용, 하한은 그대로', () => {
    expect(dateError('2030-01-01', TODAY, { allowFuture: true })).toBeNull()
    expect(dateError('0026-02-05', TODAY, { allowFuture: true })).toMatch(/이전/)
  })
  it('형식 오류·존재하지 않는 날짜', () => {
    expect(dateError('2026-2-5', TODAY)).toMatch(/형식/)
    expect(dateError('2025-02-29', TODAY)).toMatch(/존재하지/)
    expect(dateError('2024-02-29', TODAY)).toBeNull()
  })
})

describe('seoulToday', () => {
  it('Asia/Seoul 기준 날짜 (UTC 15:00 이후는 다음 날)', () => {
    expect(seoulToday(new Date('2026-10-14T14:59:00Z'))).toBe('2026-10-14')
    expect(seoulToday(new Date('2026-10-14T15:00:00Z'))).toBe('2026-10-15')
  })
})

describe('assetDateErrors (폼 차단)', () => {
  const base = { type: 'STOCK', name: 'A', acquisitionDate: '2024-01-01' }
  it('취득일 범위 밖은 차단', () => {
    expect(assetDateErrors({ ...base, acquisitionDate: '0026-02-05' }, TODAY)).toHaveLength(1)
    expect(assetDateErrors({ ...base, acquisitionDate: '2026-12-01' }, TODAY)).toHaveLength(1)
  })
  it('매각일: 미래(FUTURE_SALE)는 허용, 1900 이전·취득일보다 빠르면 차단', () => {
    expect(assetDateErrors({ ...base, disposalDate: '2030-06-30' }, TODAY)).toEqual([])
    expect(assetDateErrors({ ...base, disposalDate: '0026-02-05' }, TODAY)).toHaveLength(1)
    expect(assetDateErrors({ ...base, disposalDate: '2023-01-01' }, TODAY)[0]).toMatch(/빠릅니다/)
  })
})

describe('assetWarnings (저장 허용)', () => {
  const base = { type: 'STOCK', name: '삼성전자', quantity: 10, currentValue: 700_000, accountName: '키움', ticker: '005930.KS' }
  it('정상 입력은 경고 없음', () => {
    expect(checkAsset({ ...base, acquisitionDate: '2024-01-01' }, [], TODAY)).toEqual({ errors: [], warnings: [] })
  })
  it('수량·평가액 0 + 매각일 없음 → 경고. 매각일·수급권·연결 항목은 제외', () => {
    const zero = { ...base, quantity: 0, currentValue: 0 }
    expect(assetWarnings(zero, [])[0]).toMatch(/매각일이 없습니다/)
    expect(assetWarnings({ ...zero, disposalDate: '2025-01-01' }, [])).toEqual([])
    expect(assetWarnings({ ...zero, type: 'PENSION', entitlement: true }, [])).toEqual([])
    expect(assetWarnings({ ...zero, type: 'PENSION', linked: true }, [])).toEqual([])
  })
  it('같은 계좌·같은 티커 중복 (대소문자·공백 무시, 다른 계좌·매각·자기 자신 제외)', () => {
    const others = [
      { id: 'x', type: 'STOCK', name: '삼성전자(기존)', accountName: ' 키움 ', ticker: '005930.ks' },
      { id: 'y', type: 'STOCK', name: '다른계좌', accountName: '미래', ticker: '005930.KS' },
    ]
    expect(assetWarnings(base, others)[0]).toMatch(/같은 티커.*삼성전자\(기존\)/)
    expect(findDuplicateStock({ ...base, id: 'x' }, others.slice(0, 1))).toBeUndefined()
    expect(findDuplicateStock({ ...base, accountName: '토스' }, others)).toBeUndefined()
    expect(findDuplicateStock(base, [{ ...others[0], disposalDate: '2025-01-01' }])).toBeUndefined()
  })
  it('티커가 없으면 계좌+이름으로 중복 판단', () => {
    const noTicker = { ...base, ticker: undefined, name: '비상장 A' }
    expect(assetWarnings(noTicker, [{ id: 'z', type: 'STOCK', name: ' 비상장 A', accountName: '키움' }])[0]).toMatch(/같은 이름/)
    expect(findDuplicateStock(noTicker, [{ id: 'z', type: 'STOCK', name: '비상장 B', accountName: '키움' }])).toBeUndefined()
  })
})

describe('backupWarnings (가져오기 — 차단 없음)', () => {
  it('날짜·0원·중복·이력 날짜를 자산명이 붙은 목록으로 돌려준다', () => {
    const w = backupWarnings({
      assets: [
        { id: 'a', type: 'STOCK', name: 'A', acquisitionDate: '0026-02-05', quantity: 1, currentValue: 1 },
        { id: 'b', type: 'STOCK', name: 'B', acquisitionDate: '2024-01-01', quantity: 0, currentValue: 0 },
        { id: 'c', type: 'STOCK', name: 'C', acquisitionDate: '2024-01-01', quantity: 1, currentValue: 1 },
        { id: 'n', type: 'PENSION', name: '국민연금', acquisitionDate: '2024-01-01', quantity: 0, currentValue: 0 },
        { id: 'l', type: 'PENSION', name: '퇴직연금', acquisitionDate: '2024-01-01', quantity: 0, currentValue: 0 },
        { id: 'f', type: 'REAL_ESTATE', name: '매각예정', acquisitionDate: '2020-01-01', disposalDate: '2030-01-01', quantity: 1, currentValue: 1 },
      ],
      stockDetails: [{ assetId: 'a', accountName: '키움', ticker: 'AAPL' }, { assetId: 'c', accountName: '키움', ticker: 'AAPL' }],
      pensionDetails: [{ assetId: 'n', pensionType: 'NATIONAL' }, { assetId: 'l', linkedStockId: '키움' }],
      assetHistory: [{ assetId: 'a', date: '0026-02-05' }, { assetId: 'a', date: '2026-02-06' }],
    }, TODAY)
    expect(w).toHaveLength(4)
    expect(w[0]).toMatch(/^A: 취득일/)
    expect(w[1]).toMatch(/^A: 이력 날짜 1건.*0026-02-05/)
    expect(w[2]).toMatch(/^B: 수량·평가액/)
    expect(w[3]).toMatch(/^C: 같은 계좌/)
  })
})

// 2단계 — 계좌 입력 방식 혼용 차단: 같은 계좌에 계좌 통합(총액) 행 + 종목별 행 금지 (폼 전용, 저장 데이터 불변)
describe('accountModeError (계좌 통합/종목별 혼용 차단)', () => {
  const perStock = (id: string, accountName = '키움') => ({ id, type: 'STOCK', name: id, accountName, isAccountLevel: false })
  const aggregate = (id: string, accountName = '키움') => ({ id, type: 'STOCK', name: id, accountName, isAccountLevel: true })

  it('종목별이 있는 계좌에 계좌 통합 행을 추가하면 차단', () => {
    const err = accountModeError(aggregate('new'), [perStock('a'), perStock('b')])
    expect(err).toMatch(/종목별 기록 2건/)
    expect(err).toMatch(/이중 합산/)
  })
  it('계좌 통합 행이 있는 계좌에 종목별 행을 추가하면 차단', () => {
    expect(accountModeError(perStock('new'), [aggregate('agg')])).toMatch(/계좌 통합\(총액\) 행이 있어/)
  })
  it('같은 모드끼리·다른 계좌·매각 행·자기 자신은 허용', () => {
    expect(accountModeError(perStock('new'), [perStock('a')])).toBeNull()
    expect(accountModeError(aggregate('new'), [perStock('a', '다른계좌')])).toBeNull()
    expect(accountModeError(aggregate('new'), [{ ...perStock('a'), disposalDate: '2025-01-01' }])).toBeNull()
    expect(accountModeError({ ...aggregate('same'), id: 'same' }, [perStock('same')])).toBeNull()
  })
  it('계좌명은 trim 기준으로 비교', () => {
    expect(accountModeError(aggregate('new', ' 키움 '), [perStock('a', '키움')])).toMatch(/종목별/)
  })
  it('주식이 아니거나 매각된 입력은 검사하지 않는다', () => {
    expect(accountModeError({ ...aggregate('new'), type: 'PENSION' }, [perStock('a')])).toBeNull()
    expect(accountModeError({ ...aggregate('new'), disposalDate: '2025-01-01' }, [perStock('a')])).toBeNull()
  })
})
