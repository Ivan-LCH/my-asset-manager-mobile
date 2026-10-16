import { fetchStockHistory } from '../stockPrice'
import { fingerprint } from '@/planner/model'
import { db, type HistoryRow, type StockRow } from './schema'
import { getExchangeRate } from './exchangeRate'
import { getAllAssets } from './assets'

/** 실제 과거 종가 소급 반영 — 이미 기록된 날짜의 price를 실세가로 덮어쓰고 value 재계산.
 *  보유 수량은 기존 기록 값 유지(과거 매수/매도 이력 보존). 존재하는 행만 갱신. */
export async function applyPriceHistory(
  assetId: string,
  series: { date: string; close: number }[],
): Promise<number> {
  const stock = await db.stockDetails.get(assetId)
  const rate = await getExchangeRate(stock?.currency ?? 'KRW')
  let updated = 0
  await db.transaction('rw', 'assetHistory', async () => {
    for (const { date, close } of series) {
      const existing = await db.assetHistory
        .where('[assetId+date]').equals([assetId, date]).first()
      if (!existing) continue   // 기록 없는 날은 건너뜀 (수량을 모르는 날 추정 불가)
      const qty = existing.quantity ?? 0
      await db.assetHistory.put({
        ...existing,
        price: close,
        value: close * qty * rate,
      })
      updated++
    }
  })
  return updated
}

/** 보유 주식 전체의 최근 N개월 실제 종가 소급 반영 (설정 페이지 버튼용).
 *  Yahoo 일별 종가를 가져와 기존 이력 행의 price/value를 실세가로 덮어쓴다. */
export async function backfillStockPrices(
  months = 3,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ assets: number; updated: number; failed: string[] }> {
  const stocks = (await getAllAssets('STOCK')).filter(
    (a) => !a.disposalDate && (a.detail as { ticker?: string } | undefined)?.ticker,
  )
  const range = months <= 1 ? '1mo' : months <= 3 ? '3mo' : months <= 6 ? '6mo' : '1y'
  let updated = 0
  const failed: string[] = []
  let done = 0
  for (const a of stocks) {
    const ticker = (a.detail as { ticker?: string }).ticker!
    const hist = await fetchStockHistory(ticker, range)
    if (hist) updated += await applyPriceHistory(a.id, hist)
    else failed.push(a.name)
    done++
    onProgress?.(done, stocks.length, a.name)
  }
  return { assets: stocks.length, updated, failed }
}

export interface PriceCorrectionPreview {
  assets: number; failed: string[]; from: string; to: string
  changes: {before: HistoryRow; after: HistoryRow}[]
  additions?: HistoryRow[]
  guards?: {assetId: string; fingerprint: string}[]
  checked?: number; unchanged?: number; noHistory?: number; excluded?: number; missingQuantity?: number
}
async function correctionState(assetId: string) {
  return {
    asset: await db.assets.get(assetId),
    stock: await db.stockDetails.get(assetId),
    history: (await db.assetHistory.where('assetId').equals(assetId).toArray()).sort((a,b)=>a.date.localeCompare(b.date)),
  }
}
export async function previewStockPriceCorrection(months=3, onProgress?: (done: number, total: number) => void):Promise<PriceCorrectionPreview> {
  const end=new Date(),start=new Date(end),day=start.getUTCDate()
  start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-months)
  start.setUTCDate(Math.min(day,new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate()))
  const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10)
  // Foreign KRW valuations require historical FX. Never use today's rate for past dates.
  const all=(await getAllAssets('STOCK')).filter(a=>!a.disposalDate&&(a.detail as StockRow)?.ticker)
  const stocks=all.filter(a=>(a.detail as StockRow)?.currency==='KRW'&&!(a.detail as StockRow)?.isAccountLevel)
  const preview:PriceCorrectionPreview={assets:stocks.length,failed:[],excluded:all.length-stocks.length,from,to,changes:[],additions:[],guards:[],checked:0,unchanged:0,noHistory:0,missingQuantity:0}
  const cache=new Map<string,Awaited<ReturnType<typeof fetchStockHistory>>>();let done=0
  onProgress?.(0,stocks.length)
  for(const a of stocks){
    const ticker=(a.detail as StockRow).ticker!
    if(!cache.has(ticker))cache.set(ticker,await fetchStockHistory(ticker,months<=3?'3mo':'1y'))
    const series=cache.get(ticker)
    if(!series){preview.failed.push(a.name);onProgress?.(++done,stocks.length);continue}
    const state=await db.transaction('r',db.assets,db.stockDetails,db.assetHistory,()=>correctionState(a.id))
    if(!state.asset||state.asset.disposalDate||state.stock?.ticker!==ticker||state.stock.currency!=='KRW'||state.stock.isAccountLevel)throw new Error('조회 중 자산 정보가 변경되었습니다. 다시 조회해 주세요.')
    preview.guards!.push({assetId:a.id,fingerprint:fingerprint(state)})
    const rows=state.history,byDate=new Map(rows.map(h=>[h.date,h]))
    const anchors=rows.filter(h=>!h.quantitySourceDate)
    const seen=new Set<string>();let matched=0
    for(const observation of [...series].sort((x,y)=>x.date.localeCompare(y.date))){
      const date=observation.date
      if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||date<from||date>=to||(state.asset.acquisitionDate&&date<state.asset.acquisitionDate)||seen.has(date)||!Number.isFinite(observation.close)||observation.close<=0)continue
      seen.add(date)
      const row=byDate.get(date)
      const previous=anchors.filter(h=>h.date<date)
      const source=row&&!row.quantitySourceDate?row:previous[previous.length-1]
      const quantity=source?.quantity
      if(quantity==null||!Number.isFinite(quantity)||quantity<0){preview.missingQuantity!++;continue}
      matched++;preview.checked!++
      const after:HistoryRow={...(row??{assetId:a.id,date}),price:observation.close,quantity,value:observation.close*quantity}
      if(!row||row.quantitySourceDate)after.quantitySourceDate=source!.date
      if(!row)preview.additions!.push(after)
      else if(fingerprint(row)!==fingerprint(after))preview.changes.push({before:row,after})
      else preview.unchanged!++
    }
    if(!matched)preview.noHistory!++
    onProgress?.(++done,stocks.length)
  }
  return preview
}
export async function applyStockPriceCorrection(preview:PriceCorrectionPreview) {
  if(!preview.changes.length&&!preview.additions?.length)return
  await db.transaction('rw',db.assets,db.stockDetails,db.assetHistory,db.table('plannerRecovery'),async()=>{
    for(const guard of preview.guards??[]){
      if(fingerprint(await correctionState(guard.assetId))!==guard.fingerprint)throw new Error('미리보기 뒤 자산·수량·이력이 변경되었습니다. 다시 조회해 주세요.')
    }
    for(const change of preview.changes){
      const current=await db.assetHistory.get(change.before.id!)
      if(fingerprint(current)!==fingerprint(change.before))throw new Error('미리보기 뒤 이력이 변경되었습니다. 다시 조회해 주세요.')
    }
    const keys=new Set<string>()
    for(const row of preview.additions??[]){
      const key=row.assetId+':'+row.date
      if(keys.has(key)||await db.assetHistory.where('[assetId+date]').equals([row.assetId,row.date]).count())throw new Error('추가할 날짜에 이미 이력이 있습니다. 다시 조회해 주세요.')
      keys.add(key)
    }
    const additions:HistoryRow[]=[]
    for(const row of preview.additions??[]){const {id: _id,...value}=row;const id=await db.assetHistory.add(value);additions.push({...value,id})}
    for(const change of preview.changes)await db.assetHistory.put(change.after)
    await db.table('plannerRecovery').put({id:'price-correction',createdAt:new Date().toISOString(),changes:preview.changes,additions})
  })
}
export async function undoStockPriceCorrection() {
  await db.transaction('rw',db.assetHistory,db.table('plannerRecovery'),async()=>{
    const row=await db.table('plannerRecovery').get('price-correction');if(!row)throw new Error('되돌릴 시세 보정이 없습니다.')
    for(const after of [...row.changes.map((change:{after:HistoryRow})=>change.after),...(row.additions??[])]){
      const current=await db.assetHistory.get(after.id)
      if(fingerprint(current)!==fingerprint(after))throw new Error('보정 이후 해당 이력이 변경되어 자동 되돌리기를 중단했습니다.')
    }
    for(const change of row.changes)await db.assetHistory.put(change.before)
    for(const added of row.additions??[])await db.assetHistory.delete(added.id)
    await db.table('plannerRecovery').delete('price-correction')
  })
}
