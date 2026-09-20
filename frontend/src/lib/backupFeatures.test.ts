import 'fake-indexeddb/auto'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {IncomeTaxSettings} from '@/types'
import {db,createAsset,exportBackup,importBackup,previewBackup,restorePreviousImport,getLastBackupImport} from './db'
import {backupDetails,backupFileName,backupReplacementWarnings} from './backupInfo'

// Synthetic data only. A raw settings value must remain lossless, including future fields.
const plan={
  allocations:[{lumpsumId:'lump',irpSourceId:'retirement',irpAmount:450000000,stockAmount:0,irpRetirementTaxRate:0}],
  irpTransfers:[{sourceId:'retirement',targetId:'personal',year:2031}],
  healthHouseholdMode:'joint',stockInputMode:'assets',
  incomeTaxSettings:{
    people:{husband:{publicPensionTaxableRatio:0,eligibleDividendRatio:0,incomeDeduction:0},wife:{privatePensionMode:'comprehensive'}},
    sources:{retirement:{fundingKind:'mixed',retirementPrincipal:200000000,exemptPrincipal:0,retirementTaxRate:0,firstReceiptYear:2031,lifetime:false},personal:{fundingKind:'personal',retirementShare:0,exemptShare:0}},
    sourceYears:{2031:{personal:{retirementShare:0,exemptShare:0}}},
    years:{2031:{husband:{foreignIncome:0,foreignTaxPaid:0,foreignCreditNational:0,foreignCreditLocal:0,domesticWithholding:0,nationalCredit:0,localCredit:0}}},
  } satisfies IncomeTaxSettings,futureField:{preserve:['unknown',0,false]},
}
async function fixture(){
  const id=await createAsset({type:'STOCK',name:'SYNTHETIC',acquisitionDate:'2026-06-01',acquisitionPrice:100,quantity:10,detail:{accountName:'TEST',ticker:'TEST',currency:'KRW',isPensionLike:false}})
  const row=(await db.assetHistory.where('assetId').equals(id).first())!
  await db.assetHistory.update(row.id!,{date:'2026-09-16',quantitySourceDate:'2026-06-01'})
  await db.settings.put({key:'pension_sim_plan',value:JSON.stringify(plan)})
  return exportBackup()
}
describe('최근 IRP·세금·시세 백업 보존',()=>{
  beforeEach(async()=>{await Promise.all(db.tables.map(t=>t.clear()))})
  afterEach(()=>{vi.unstubAllGlobals()})
  it.each([1,2] as const)('v%s 왕복에서 추가 설정, 명시적 0/false와 시세 근거를 그대로 보존',async version=>{
    const backup=await fixture();backup.version=version
    if(version===1)for(const key of ['plannerPlans','plannerRuns','plannerDrafts'])delete backup.tables[key]
    await importBackup(backup,undefined,'synthetic.json')
    const roundtrip=await exportBackup()
    for(const [name,rows] of Object.entries(backup.tables))expect(roundtrip.tables[name]).toEqual(rows)
    expect((await db.settings.get('pension_sim_plan'))?.value).toBe(JSON.stringify(plan))
    expect(backupDetails(roundtrip)).toMatchObject({assets:1,history:1,inferredHistory:1,transfers:1,linkedLumpsums:1,lumpTaxRates:1,people:2,sourceTax:2,funding:2,sourceYears:1,taxYears:1,lastHistoryDate:'2026-09-16'})
  })
  it('미리보기는 쓰지 않으며 이전 백업의 설정·이력 손실을 경고',async()=>{
    const current=await fixture(),incoming=structuredClone(current)
    incoming.tables.settings=[];incoming.tables.assetHistory=[]
    const preview=await previewBackup(incoming)
    expect(preview.warnings.join('\n')).toContain('IRP·세금')
    expect(preview.warnings.join('\n')).toContain('이력 수')
    expect(preview.warnings.join('\n')).toContain('과거 자료')
    expect(preview.summary).toContain(incoming.exportedAt)
    expect((await exportBackup()).tables).toEqual(current.tables)
    expect(await getLastBackupImport()).toBeNull()
  })
  it('같은 건수라도 다른 사람·연도의 설정으로 대체되면 누락 경고',async()=>{
    const current=await fixture(),incoming=structuredClone(current),changed=structuredClone(plan)
    changed.incomeTaxSettings.years={2032:{wife:{domesticWithholding:0}}} as any
    incoming.tables.settings=[{key:'pension_sim_plan',value:JSON.stringify(changed)}]
    expect(backupReplacementWarnings(current,incoming).join('')).toContain('IRP·세금')
    expect(backupReplacementWarnings(current,current)).toEqual([])
  })
  it('마지막 가져오기 기록은 남기되 개인 데이터 백업에 복구 사본은 섞지 않음',async()=>{
    const b=await fixture();await importBackup(b,undefined,'synthetic-2026.json')
    expect(await getLastBackupImport()).toMatchObject({sourceName:'synthetic-2026.json',exportedAt:b.exportedAt})
    expect((await getLastBackupImport())?.summary).toContain('IRP 합산 1건')
    expect((await exportBackup()).tables.plannerRecovery).toBeUndefined()
    const receipt=await getLastBackupImport(),bad=structuredClone(b)
    delete bad.tables.assets
    await expect(importBackup(bad,undefined,'invalid.json')).rejects.toThrow()
    expect(await getLastBackupImport()).toEqual(receipt)
    expect((await exportBackup()).tables).toEqual(b.tables)
  })
  it('직전 사본 복구가 사라진 IRP·세금·시세 정보를 모두 되살림',async()=>{
    const b=await fixture(),old=structuredClone(b);old.tables.settings=[];old.tables.assetHistory=[]
    await importBackup(old)
    await restorePreviousImport()
    expect((await exportBackup()).tables).toEqual(b.tables)
    expect((await getLastBackupImport())?.sourceName).toBe('직전 사본 복구')
  })
  it('같은 날 내보낸 파일도 시각으로 구분하고 Windows 파일명으로 사용 가능',()=>{
    const a=backupFileName('2026-09-17T00:00:01.001Z'),b=backupFileName('2026-09-17T00:00:01.002Z')
    expect(a).not.toBe(b);expect(a).not.toMatch(/[<>:"/\\|?*]/)
    expect(()=>backupFileName('invalid')).toThrow()
  })
  it('Drive도 같은 백업 내용과 시각별 파일명을 사용한다 (외부 접속 없는 모의 API)',async()=>{
    const drive=await import('./googleDrive'),backup=await fixture(),json=JSON.stringify(backup)
    vi.stubGlobal('window',{google:{accounts:{oauth2:{initTokenClient:(options:any)=>({requestAccessToken:()=>options.callback({access_token:'synthetic-token'})})}}}})
    const fetchMock=vi.fn(async(url:string,options?:RequestInit)=>{
      if(url.includes('alt=media'))return {ok:true,text:async()=>json}
      if(options?.method==='POST')return {ok:true,json:async()=>({id:'synthetic-id',name:backupFileName(backup.exportedAt)})}
      return {ok:true,json:async()=>({files:[]})}
    })
    vi.stubGlobal('fetch',fetchMock)
    try{
      await drive.googleSignIn()
      expect((await drive.saveToDrive(json)).name).toBe(backupFileName(backup.exportedAt))
      const upload=fetchMock.mock.calls.find(([,options])=>options?.method==='POST')
      expect(String(upload?.[1]?.body)).toContain(json)
      expect(JSON.parse(await drive.loadFromDrive('synthetic-id'))).toEqual(backup)
    }finally{drive.logout()}
  })
})
