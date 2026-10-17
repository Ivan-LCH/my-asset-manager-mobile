import { db } from './schema'
import { getExchangeRate } from './exchangeRate'

/** Quote observations never carry a stale quantity or rewrite later history. */
export async function beginQuoteRequest(assetIds: string[], requestId: string) {
  await db.transaction('rw', db.settings, async () => {
    for (const id of assetIds) await db.settings.put({key:'quote-request:'+id,value:requestId})
  })
}
/** failure: 시세 조회 실패 사유(stockPrice.fetchStockQuote 의 error/status)와 라벨 — quote-status 에 함께 기록 */
export async function applyQuoteObservation(assetId:string,ticker:string,price:number|null,date:string,requestId:string,failure?:{error:string;status?:number;label:string}):Promise<boolean> {
  return db.transaction('rw', db.assets, db.stockDetails, db.assetHistory, db.settings, async () => {
    if ((await db.settings.get('quote-request:'+assetId))?.value !== requestId) return false
    const a=await db.assets.get(assetId), stock=await db.stockDetails.get(assetId)
    let reason='',fetchFailed=false
    if (!a || a.type!=='STOCK' || a.disposalDate) reason='처분되었거나 존재하지 않는 종목'
    else if(stock?.ticker!==ticker || stock?.isAccountLevel) reason='티커/계좌 입력이 변경되어 재조회 필요'
    else if(price===null || !Number.isFinite(price) || price<=0) {fetchFailed=true;reason=`시세 조회 실패${failure?` (${failure.label})`:''} — 기존 평가액 유지`}
    else if((await db.assetHistory.where('assetId').equals(assetId).toArray()).some(h=>h.date>date)) reason='미래 이력이 있어 확인 필요'
    const observedAt=new Date().toISOString()
    const error=fetchFailed?failure?.error??'no_price':undefined,status=fetchFailed?failure?.status:undefined
    await db.settings.put({key:'quote-status:'+assetId,value:JSON.stringify({observedAt,ok:!reason,reason,error,status,marketTimestamp:null})})
    if(reason || !a || price===null)return false
    const rate=await getExchangeRate(stock?.currency??'KRW'),value=price*a.quantity*rate
    const existing=await db.assetHistory.where('[assetId+date]').equals([assetId,date]).first()
    await db.assetHistory.put({...existing,assetId,date,price,quantity:a.quantity,value})
    await db.assets.update(assetId,{currentValue:value,updatedAt:observedAt})
    return true
  })
}
