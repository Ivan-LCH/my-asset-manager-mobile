// /api/* 입력 검증 공통 — prod(Vercel 서버리스)와 dev(vite 미들웨어)가 같은 규칙을 쓴다.
// `_` 접두사라 Vercel 라우트로 노출되지 않는다.

/** 티커 허용 문자: 영문·숫자·^ = . - (예: 005930.KS, 0040X0.KS, KRW=X, ^KS11, BRK-B). */
export const TICKER_RE = /^[A-Za-z0-9^=.\-]{1,20}$/
export const MAX_QUERY_LEN = 50

/** 유효하면 티커 문자열, 아니면 null (배열·빈 값·허용 외 문자 포함 시 null). */
export function validTicker(v: unknown): string | null {
  return typeof v === 'string' && TICKER_RE.test(v) ? v : null
}

/** 검색어: 공백 제거 후 1~50자. 아니면 null. */
export function validQuery(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const q = v.trim()
  return q.length > 0 && q.length <= MAX_QUERY_LEN ? q : null
}
