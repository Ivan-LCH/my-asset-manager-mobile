import { afterEach, describe, expect, it, vi } from 'vitest'
import { validQuery, validTicker } from '../../api/_validate'
import priceHandler from '../../api/price'
import searchHandler from '../../api/search'
import yieldHandler from '../../api/yield'
// vite.config.ts 는 tsconfig.node.json 소속이라 타입 검사 밖에서 동적 import
const viteConfig = (await import('../../vite.config' as string)).default

const GOOD = ['005930.KS', '0040X0.KS', '0183J0.KS', 'KRW=X', 'JPYKRW=X', '^KS11', 'BRK-B', 'SCHD', 'a']
const BAD = ['', '005930.KS/../x', 'A B', 'abc?x=1', 'a&b', '<script>', 'A'.repeat(21), '삼성전자', '%2F']

function mockRes() {
  const headers: Record<string, string> = {}
  return { headers, statusCode: 0, body: '', setHeader(k: string, v: string) { headers[k] = v }, end(b?: string) { this.body = b ?? '' } }
}
afterEach(() => vi.unstubAllGlobals())

describe('/api 입력 검증 공통 규칙', () => {
  it.each(GOOD)('허용: %s', t => expect(validTicker(t)).toBe(t))
  it.each(BAD)('거절: %j', t => expect(validTicker(t)).toBeNull())
  it('배열·비문자열 거절', () => { expect(validTicker(['SCHD'])).toBeNull(); expect(validTicker(1)).toBeNull() })
  it('검색어는 50자 이하', () => {
    expect(validQuery('삼성전자')).toBe('삼성전자')
    expect(validQuery('가'.repeat(50))).toHaveLength(50)
    expect(validQuery('가'.repeat(51))).toBeNull()
    expect(validQuery('   ')).toBeNull()
  })
})

describe('Vercel 함수 (prod)', () => {
  it.each([['price', priceHandler], ['yield', yieldHandler]] as const)('%s: 잘못된 티커는 400, 외부 호출 없음, ACAO 없음', async (_, handler) => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    for (const ticker of ['A B', '../x', 'A'.repeat(21)]) {
      const res = mockRes()
      await handler({ query: { ticker } }, res)
      expect(res.statusCode).toBe(400)
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('price: 영문 섞인 KRX 코드·환율 티커는 그대로 전달, ACAO 없음', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '{"chart":{}}' })); vi.stubGlobal('fetch', fetchMock)
    for (const ticker of ['0040X0.KS', 'KRW=X', '^KS11', 'BRK-B']) {
      const res = mockRes()
      await priceHandler({ query: { ticker } }, res)
      expect(res.statusCode).toBe(200)
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    }
    expect(fetchMock.mock.calls.map(c => String((c as unknown[])[0]))).toEqual([
      expect.stringContaining('/chart/0040X0.KS?'), expect.stringContaining('/chart/KRW%3DX?'),
      expect.stringContaining('/chart/%5EKS11?'), expect.stringContaining('/chart/BRK-B?'),
    ])
  })
  it('search: 50자 초과 400, ACAO 없음', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await searchHandler({ query: { q: 'x'.repeat(51) } }, res)
    expect(res.statusCode).toBe(400)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('vite dev 미들웨어도 같은 규칙', () => {
  const middlewares: Record<string, (req: any, res: any) => Promise<void>> = {}
  for (const p of (viteConfig as any).plugins.flat()) {
    if (p && typeof p.configureServer === 'function' && /-proxy-dev$/.test(p.name)) p.configureServer({ middlewares: { use: (path: string, fn: any) => { middlewares[path] = fn } } })
  }
  it('price·yield·search 미들웨어 등록', () => expect(Object.keys(middlewares).sort()).toEqual(['/api/price', '/api/search', '/api/yield']))
  it.each(['/api/price', '/api/yield'])('%s: 잘못된 티커 400, 외부 호출 없음', async path => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await middlewares[path]({ url: '/?ticker=' + encodeURIComponent('A B') }, res)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('/api/price: 0040X0.KS 허용', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '{}' })); vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await middlewares['/api/price']({ url: '/?ticker=0040X0.KS' }, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })
  it('/api/search: 50자 초과 400', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const res = mockRes()
    await middlewares['/api/search']({ url: '/?q=' + 'x'.repeat(51) }, res)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
