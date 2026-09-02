// 주요 종목 티커 프리셋 — Yahoo 한글 검색 미지원 대비 + 오프라인 폴백 겸용.
// 검색어와 매칭되면 API 호출 없이 즉시 상단에 표시한다.
export interface StockPreset {
  name: string      // 표시용 종목명
  ticker: string    // Yahoo 티커
  currency: 'KRW' | 'USD'
  aliases?: string[] // 별칭 (초성/짧은 이름 등)
}

export const STOCK_PRESETS: StockPreset[] = [
  // ── 국내 대형주 ──
  { name: '삼성전자',     ticker: '005930.KS', currency: 'KRW', aliases: ['ㅅㅅㅈㅈ'] },
  { name: '삼성전자우',   ticker: '005935.KS', currency: 'KRW' },
  { name: 'SK하이닉스',   ticker: '000660.KS', currency: 'KRW', aliases: ['하이닉스'] },
  { name: 'LG에너지솔루션', ticker: '373220.KS', currency: 'KRW', aliases: ['엘지에너지', '엔솔'] },
  { name: '삼성바이오로직스', ticker: '207940.KS', currency: 'KRW' },
  { name: '현대차',       ticker: '005380.KS', currency: 'KRW', aliases: ['현대자동차'] },
  { name: '기아',         ticker: '000270.KS', currency: 'KRW' },
  { name: 'NAVER',        ticker: '035420.KS', currency: 'KRW', aliases: ['네이버'] },
  { name: '카카오',       ticker: '035720.KS', currency: 'KRW' },
  { name: '셀트리온',     ticker: '068270.KS', currency: 'KRW' },
  { name: 'POSCO홀딩스',  ticker: '005490.KS', currency: 'KRW', aliases: ['포스코'] },
  { name: 'KB금융',       ticker: '105560.KS', currency: 'KRW' },
  { name: '신한지주',     ticker: '055550.KS', currency: 'KRW' },
  { name: '삼성SDI',      ticker: '006400.KS', currency: 'KRW' },
  { name: 'LG화학',       ticker: '051910.KS', currency: 'KRW' },
  { name: '카카오뱅크',   ticker: '323410.KS', currency: 'KRW' },
  { name: '한화에어로스페이스', ticker: '012450.KS', currency: 'KRW' },
  { name: '두산에너빌리티', ticker: '034020.KS', currency: 'KRW' },
  // ── 국내 주요 ETF ──
  { name: 'KODEX 200',         ticker: '069500.KS', currency: 'KRW' },
  { name: 'TIGER 200',         ticker: '102110.KS', currency: 'KRW' },
  { name: 'KODEX 미국S&P500',  ticker: '379800.KS', currency: 'KRW', aliases: ['S&P500', 'sp500'] },
  { name: 'TIGER 미국S&P500',  ticker: '360750.KS', currency: 'KRW', aliases: ['타이거sp500'] },
  { name: 'KODEX 미국나스닥100', ticker: '379810.KS', currency: 'KRW', aliases: ['나스닥', '나스닥100'] },
  { name: 'TIGER 미국나스닥100', ticker: '133690.KS', currency: 'KRW', aliases: ['타이거나스닥'] },
  { name: 'TIGER 미국배당다우존스', ticker: '458730.KS', currency: 'KRW' },
  { name: 'ACE 테슬라밸류체인액티브', ticker: '457480.KS', currency: 'KRW', aliases: ['테슬라밸류체인'] },
  { name: 'RISE 미국배당프리미엄액티브', ticker: '0076V0.KS', currency: 'KRW' },
  { name: 'KODEX 반도체',      ticker: '091160.KS', currency: 'KRW' },
  { name: 'TIGER 2차전지테마', ticker: '305540.KS', currency: 'KRW' },
  // ── 미국 주요주 ──
  { name: 'Apple',       ticker: 'AAPL',  currency: 'USD', aliases: ['애플'] },
  { name: 'Microsoft',   ticker: 'MSFT',  currency: 'USD', aliases: ['마이크로소프트'] },
  { name: 'NVIDIA',      ticker: 'NVDA',  currency: 'USD', aliases: ['엔비디아'] },
  { name: 'Tesla',       ticker: 'TSLA',  currency: 'USD', aliases: ['테슬라'] },
  { name: 'Alphabet (Google)', ticker: 'GOOGL', currency: 'USD', aliases: ['구글', '알파벳'] },
  { name: 'Amazon',      ticker: 'AMZN',  currency: 'USD', aliases: ['아마존'] },
  { name: 'Meta',        ticker: 'META',  currency: 'USD', aliases: ['메타', '페이스북'] },
  { name: 'Berkshire Hathaway B', ticker: 'BRK-B', currency: 'USD', aliases: ['버크셔'] },
  // ── 미국 ETF ──
  { name: 'S&P500 (SPY)',  ticker: 'SPY',  currency: 'USD', aliases: ['spy'] },
  { name: 'S&P500 (VOO)',  ticker: 'VOO',  currency: 'USD', aliases: ['voo'] },
  { name: 'NASDAQ100 (QQQ)', ticker: 'QQQ', currency: 'USD', aliases: ['qqq'] },
  { name: 'SCHD (미국 배당)', ticker: 'SCHD', currency: 'USD', aliases: ['schd'] },
  { name: 'JEPI (커버드콜)', ticker: 'JEPI', currency: 'USD', aliases: ['jepi'] },
  { name: 'VTI (전미국)',  ticker: 'VTI',  currency: 'USD', aliases: ['vti'] },
]

/** 검색어로 프리셋 매칭 (이름/별칭/티커, 대소문자·공백 무시) */
export function matchPresets(q: string, limit = 6): StockPreset[] {
  const needle = q.trim().toLowerCase().replace(/\s+/g, '')
  if (!needle) return []
  return STOCK_PRESETS.filter((p) => {
    const hay = [p.name, p.ticker, ...(p.aliases ?? [])]
    return hay.some((h) => h.toLowerCase().replace(/\s+/g, '').includes(needle))
  }).slice(0, limit)
}
