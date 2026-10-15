// 2단계 — 금액 표기 통일: fmtAmount 코어 + 기존 포맷터 래핑 + 수량·비율·한국 날짜
import { describe, it, expect } from 'vitest'
import {
  fmtAmount, formatMoney, formatManwon, formatWon, formatEok, formatPnl, formatPnlManwon,
  formatPrice, formatAvgPrice, fmtQty, fmtPct, formatKoreanDate,
  formatAmountInput, parseAmountInput, isKrwPriceInput, MISSING,
} from './utils'

describe('fmtAmount 코어', () => {
  it('null·undefined·NaN·Infinity 는 미입력', () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(fmtAmount(v as number | null)).toBe(MISSING)
      expect(fmtAmount(v as number | null, { unit: 'manwon' })).toBe(MISSING)
      expect(fmtAmount(v as number | null, { unit: 'eok' })).toBe(MISSING)
    }
  })
  it('원 단위 반올림·콤마·기호', () => {
    expect(fmtAmount(1234)).toBe('1,234원')
    expect(fmtAmount(1234.5)).toBe('1,235원')
    expect(fmtAmount(-1234)).toBe('-1,234원')
    expect(fmtAmount(1234, { symbol: true })).toBe('₩1,234')
    expect(fmtAmount(-1234, { symbol: true })).toBe('-₩1,234')
  })
  it('반올림 후 -0 은 0 — 부호는 반올림 뒤에 결정', () => {
    expect(fmtAmount(-0.4)).toBe('0원')
    expect(fmtAmount(-3000, { unit: 'manwon' })).toBe('0만원')
    expect(fmtAmount(-3000, { unit: 'eok' })).toBe('0만원')
    expect(fmtAmount(-0.4, { sign: true })).toBe('0원')   // 0에는 부호 없음
    expect(fmtAmount(-3000, { unit: 'manwon', sign: true })).toBe('0만원')
  })
  it('sign 옵션은 양수에만 +', () => {
    expect(fmtAmount(1234, { sign: true })).toBe('+1,234원')
    expect(fmtAmount(-1234, { sign: true })).toBe('-1,234원')
    expect(fmtAmount(0, { sign: true })).toBe('0원')
    expect(fmtAmount(0.4, { sign: true })).toBe('0원')    // 반올림 후 0 → 부호 없음
    expect(fmtAmount(1234, { sign: true, symbol: true })).toBe('+₩1,234')
  })
  it('억 단위 — 만원 반올림 후 1억 이상이면 억으로 (99,995,000 → 1억)', () => {
    expect(fmtAmount(115_000_000, { unit: 'eok' })).toBe('1.15억')
    expect(fmtAmount(200_000_000, { unit: 'eok' })).toBe('2억')
    expect(fmtAmount(99_995_000, { unit: 'eok' })).toBe('1억')
    expect(fmtAmount(39_810_000, { unit: 'eok' })).toBe('3,981만원')
    expect(fmtAmount(-115_000_000, { unit: 'eok', sign: true })).toBe('-1.15억')
  })
})

describe('기존 포맷터 (시그니처 유지, 코어 래핑)', () => {
  it('formatMoney', () => {
    expect(formatMoney(1234567)).toBe('₩1,234,567')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(-3000)).toBe('-₩3,000')
    expect(formatMoney(-0.4)).toBe('₩0')
  })
  it('formatManwon — -0만원 제거', () => {
    expect(formatManwon(12345678)).toBe('1,235만원')
    expect(formatManwon(-3000)).toBe('0만원')
    expect(formatManwon(undefined)).toBe('—')
  })
  it('formatPnl — 0은 부호 없음, 반올림 후 부호', () => {
    expect(formatPnl(1000)).toBe('+₩1,000')
    expect(formatPnl(-1000)).toBe('-₩1,000')
    expect(formatPnl(0)).toBe('₩0')
    expect(formatPnl(-0.4)).toBe('₩0')
    expect(formatPnl(undefined)).toBe('—')
  })
  it('formatPnlManwon — `{pnl>=0?"+":""}{formatManwon(pnl)}` 대체', () => {
    expect(formatPnlManwon(12_340_000)).toBe('+1,234만원')
    expect(formatPnlManwon(-12_340_000)).toBe('-1,234만원')
    expect(formatPnlManwon(-3000)).toBe('0만원')
  })
  it('formatWon / formatEok', () => {
    expect(formatWon(1234)).toBe('1,234원')
    expect(formatWon(undefined)).toBe('—')
    expect(formatEok(115_000_000)).toBe('1.15억')
    expect(formatEok(39_810_000)).toBe('3,981만원')
    expect(formatEok(null)).toBe('—')
  })
  it('formatPrice / formatAvgPrice — 외화 -0·미입력', () => {
    expect(formatPrice(1.234, 'USD')).toBe('$1.23')
    expect(formatPrice(-0.001, 'USD')).toBe('$0.00')
    expect(formatPrice(-1.5, 'USD', { sign: true })).toBe('-$1.50')
    expect(formatPrice(undefined, 'USD')).toBe('—')
    expect(formatAvgPrice(170000)).toBe('170,000원')
    expect(formatAvgPrice(undefined)).toBe('—')
    expect(formatAvgPrice(170.5, 'USD')).toBe('$170.50')
  })
})

describe('fmtQty — 수량 소수 최대 8자리', () => {
  it('소수점 주식·코인은 잘리지 않는다', () => {
    expect(fmtQty(3.10379)).toBe('3.10379')
    expect(fmtQty(126.797632)).toBe('126.797632')
    expect(fmtQty(8.451)).toBe('8.451')
    expect(fmtQty(1.52)).toBe('1.52')
    expect(fmtQty(0.123456789)).toBe('0.12345679')
    expect(fmtQty(1000)).toBe('1,000')
    expect(fmtQty(5, '주')).toBe('5주')
    expect(fmtQty(null)).toBe('—')
  })
})

describe('fmtPct — -0.0% 제거', () => {
  it('반올림 후 부호 결정', () => {
    expect(fmtPct(-0.04)).toBe('0.0%')
    expect(fmtPct(-0.04, 1, { sign: true })).toBe('0.0%')
    expect(fmtPct(-1.24, 1, { sign: true })).toBe('-1.2%')
    expect(fmtPct(12.34, 1, { sign: true })).toBe('+12.3%')
    expect(fmtPct(0, 1, { sign: true })).toBe('0.0%')
    expect(fmtPct(null)).toBe('—')
  })
})

describe('formatKoreanDate', () => {
  it('YYYY-MM-DD → 한국식 (+요일)', () => {
    expect(formatKoreanDate('2026-10-15')).toBe('2026년 10월 15일 (목)')
    expect(formatKoreanDate('2026-10-15', { weekday: false })).toBe('2026년 10월 15일')
    expect(formatKoreanDate('2026-01-01', { weekday: false })).toBe('2026년 1월 1일')
  })
  it('빈 값은 미입력, 형식이 아니면 원문', () => {
    expect(formatKoreanDate('')).toBe('—')
    expect(formatKoreanDate(null)).toBe('—')
    expect(formatKoreanDate('알 수 없음')).toBe('알 수 없음')
    expect(formatKoreanDate('2026-13-01')).toBe('2026-13-01')
    expect(formatKoreanDate('2025-02-29')).toBe('2025-02-29')
  })
})

describe('천단위 금액 입력 (AmountInput 코어)', () => {
  it('formatAmountInput — 0 허용, 앞자리 0 제거, 숫자만', () => {
    expect(formatAmountInput('')).toBe('')
    expect(formatAmountInput('0')).toBe('0')
    expect(formatAmountInput('0500000')).toBe('500,000')
    expect(formatAmountInput('1,234,000')).toBe('1,234,000')
    expect(formatAmountInput('12a3')).toBe('123')
    expect(formatAmountInput('000')).toBe('0')
  })
  it('parseAmountInput — 빈칸 null, 콤마 무시', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('0')).toBe(0)
    expect(parseAmountInput('1,234,000')).toBe(1234000)
  })
})

describe('isKrwPriceInput — 원화만 콤마 입력, 외화·실물 단가는 소수 입력', () => {
  it('주식은 외화 종목만 소수, 원화·계좌 통합은 콤마', () => {
    expect(isKrwPriceInput('STOCK', 'KRW')).toBe(true)
    expect(isKrwPriceInput('STOCK', 'USD')).toBe(false)
    expect(isKrwPriceInput('STOCK', 'JPY')).toBe(false)
    expect(isKrwPriceInput('STOCK', 'USD', true)).toBe(true)   // 계좌 통합 원금은 원화
  })
  it('실물자산은 통화 미보관 — 외화 단가 가능하므로 항상 소수 입력', () => {
    expect(isKrwPriceInput('PHYSICAL', 'KRW')).toBe(false)
  })
  it('그 외 유형의 취득가는 원화 총액', () => {
    for (const t of ['REAL_ESTATE', 'PENSION', 'SAVINGS', 'ETC'] as const) {
      expect(isKrwPriceInput(t, 'KRW')).toBe(true)
    }
  })
})
