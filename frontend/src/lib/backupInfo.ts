import type {BackupData} from './db'
type RecordValue=Record<string,unknown>
const object=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{}
const entries=(v:unknown)=>Object.entries(object(v))
function pensionSettings(data:BackupData){
  const row=data.tables.settings?.find(v=>object(v).key==='pension_sim_plan')
  try{return object(JSON.parse(String(object(row).value??'{}')))}catch{return {}}
}
function populated(v:unknown){return entries(v).filter(([,value])=>entries(value).length>0).length}
export function backupDetails(data:BackupData){
  const p=pensionSettings(data),tax=object(p.incomeTaxSettings),sources=entries(tax.sources)
  const allocations=Array.isArray(p.allocations)?p.allocations.map(object):[]
  const transfers=Array.isArray(p.irpTransfers)?p.irpTransfers:[]
  const history=data.tables.assetHistory??[]
  const dates=history.map(r=>String(object(r).date??'')).filter(Boolean).sort()
  return {
    assets:data.tables.assets?.length??0,history:history.length,lastHistoryDate:dates[dates.length-1]??null,
    inferredHistory:history.filter(r=>typeof object(r).quantitySourceDate==='string').length,
    transfers:transfers.length,linkedLumpsums:allocations.filter(a=>a.irpSourceId).length,
    lumpTaxRates:allocations.filter(a=>a.irpRetirementTaxRate!=null).length,
    people:populated(tax.people),sourceTax:populated(tax.sources),funding:sources.filter(([,v])=>object(v).fundingKind).length,
    sourceYears:entries(tax.sourceYears).reduce((sum,[,v])=>sum+populated(v),0),
    taxYears:entries(tax.years).reduce((sum,[,v])=>sum+populated(v),0),
  }
}
export function backupSummary(data:BackupData){
  const d=backupDetails(data)
  return [`백업 생성 시각: ${data.exportedAt}`,`자산 ${d.assets}개 · 이력 ${d.history}건 (마지막 날짜 ${d.lastHistoryDate??'없음'})`,
    `IRP 합산 ${d.transfers}건 · 목돈 계좌 연결 ${d.linkedLumpsums}건 · 목돈 세율 ${d.lumpTaxRates}건`,
    `세금 추가정보: 개인 ${d.people}명 · 연금 ${d.sourceTax}개 (재원 구분 ${d.funding}개)`,
    `연도별 연금 가정 ${d.sourceYears}건 · 기납부액/공제 등 연도별 세금 ${d.taxYears}건`,
    `직전 수량을 사용해 채운 시세 이력 ${d.inferredHistory}건`].join('\n')
}
/** Compare populated paths: another person's settings cannot mask missing fields. */
function configuredPaths(p:RecordValue){
  const paths=new Set<string>()
  const visit=(value:unknown,path:string)=>{
    if(value==null)return
    if(Array.isArray(value)){value.forEach((v,i)=>visit(v,path+'/'+i));return}
    if(typeof value==='object'){entries(value).forEach(([k,v])=>visit(v,path+'/'+k));return}
    paths.add(path)
  }
  visit(p.incomeTaxSettings,'tax')
  visit(p.monthlyPlan,'monthlyPlan')
  for(const t of Array.isArray(p.irpTransfers)?p.irpTransfers:[]){const r=object(t);paths.add('transfer/'+String(r.sourceId)+'/'+String(r.targetId)+'/'+String(r.year))}
  for(const a of Array.isArray(p.allocations)?p.allocations:[]){const r=object(a);for(const key of ['irpSourceId','irpRetirementTaxRate'])if(r[key]!=null)paths.add('allocation/'+String(r.lumpsumId)+'/'+key)}
  return paths
}
export function backupReplacementWarnings(current:BackupData,incoming:BackupData){
  const warnings:string[]=[],before=configuredPaths(pensionSettings(current)),after=configuredPaths(pensionSettings(incoming))
  const missing=[...before].filter(key=>!after.has(key)).length
  if(missing)warnings.push(`현재 저장된 IRP·세금 설정 중 ${missing}개 항목이 이 백업에는 없습니다. 전체 교체하면 없어지거나 대체됩니다.`)
  const old=backupDetails(current),next=backupDetails(incoming)
  if(old.assets>next.assets)warnings.push(`자산 수가 ${old.assets}개에서 ${next.assets}개로 줄어듭니다.`)
  if(old.history>next.history)warnings.push(`이력 수가 ${old.history}건에서 ${next.history}건으로 줄어듭니다.`)
  if(old.lastHistoryDate&&(!next.lastHistoryDate||next.lastHistoryDate<old.lastHistoryDate))warnings.push(`현재 마지막 이력(${old.lastHistoryDate})보다 과거 자료입니다.`)
  return warnings
}
export function backupFileName(exportedAt:string){
  const timestamp=new Date(exportedAt)
  if(!Number.isFinite(timestamp.getTime()))throw new Error('백업 생성 시각이 올바르지 않습니다.')
  return `asset-manager-backup-${timestamp.toISOString().replace(/[:.]/g,'-')}.json`
}
