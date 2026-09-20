import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import { db, createAsset, updateAsset, getAssetById, exportBackup, importBackup, previewBackup, restorePreviousImport, addHistory, updateHistory, beginQuoteRequest, applyQuoteObservation, applyStockPriceCorrection, undoStockPriceCorrection } from '@/lib/db';
import { blankPlan, policySchema, today, debtSchema, eventSchema, fixedDate } from './model';
import { savePlan, loadContext, calculateAndSave, saveDraft, readDraft, legacyPreview } from './storage';
import { baseScenario } from './engine';
const create = () => createAsset({ type: 'STOCK', name: 'synthetic', acquisitionDate: today(), acquisitionPrice: 100, quantity: 10, detail: { accountName: 'test', ticker: 'TEST', currency: 'KRW', isPensionLike: false } });
describe('저장·복원·시세 안전 경계', () => {
    it('기존 가구 정보는 확인용 초안에만 복사하며 저장된 사람의 편집을 덮지 않는다',async()=>{
        await db.settings.bulkPut([{key:'birthHusband',value:'1980.05'},{key:'birthWife',value:'1981.06'},{key:'retirement_plan',value:'{"expenses":[]}'}]);
        const preview=await legacyPreview();expect(preview.plan.people.map(p=>p.birthMonth)).toEqual(['1980-05','1981-06']);
        expect(await db.table('plannerPlans').count()).toBe(0);
        const p=blankPlan();p.people[0].birthMonth='1979-01';p.people[0].name='edited';await savePlan(p,0);
        expect((await legacyPreview()).plan.people).toEqual(p.people);
    });
    it('구 백업의 미입력 취득일 null은 원본 그대로 복원·재내보내고 새 분석도 보관한다', async () => {
        const id = await create(), legacy = await exportBackup();
        legacy.version = 1;
        for (const key of ['plannerPlans', 'plannerRuns', 'plannerDrafts']) delete legacy.tables[key];
        (legacy.tables.assets[0] as any).acquisitionDate = null;
        await importBackup(legacy);
        for (const [name, rows] of Object.entries(legacy.tables)) expect((await exportBackup()).tables[name]).toEqual(rows);
        expect((await getAssetById(id))?.acquisitionDate).toBe('');
        expect((await db.assets.get(id))?.acquisitionDate).toBeNull();
        await savePlan({ ...blankPlan(), endDate: '2027-12-31' }, 0);
        await calculateAndSave(baseScenario);
        const modern = await exportBackup();
        await importBackup(modern);
        expect((await exportBackup()).tables).toEqual(modern.tables);
    });
    it('취득일 null 호환을 추가해도 실제 잘못된 날짜·타입·누락은 전체 교체 전에 거절한다', async () => {
        await create(); const before = await exportBackup();
        for (const version of [1, 2] as const) for (const value of ['2026-02-30', '2026-13-01', 'not-a-date', 123, {}, undefined]) {
            const bad = structuredClone(before); bad.version = version;
            if (version === 1) for (const key of ['plannerPlans', 'plannerRuns', 'plannerDrafts']) delete bad.tables[key];
            if (value === undefined) delete (bad.tables.assets[0] as any).acquisitionDate;
            else (bad.tables.assets[0] as any).acquisitionDate = value;
            await expect(importBackup(bad)).rejects.toThrow();
            expect((await exportBackup()).tables).toEqual(before.tables);
        }
    });
    it('기존 미래 평가액은 분담금 사건 하나를 등록했다고 검토 완료로 처리하지 않는다',async()=>{const id=await createAsset({type:'REAL_ESTATE',name:'rebuild',acquisitionDate:today(),acquisitionPrice:1000,detail:{isOwned:true,hasTenant:false,address:'',loanAmount:0,tenantDeposit:0,futureYear:2027,futureValue:2000}});const p=blankPlan();p.events=[eventSchema.parse({id:'cost',name:'cost',kind:'expense',amount:100,assetId:id,at:fixedDate('2027-01-01')})];await savePlan(p,0);expect((await loadContext()).snapshot.issues.some(i=>i.code==='LEGACY_DATE')).toBe(true)})
    it('원본 부동산 대출을 0으로 갱신하면 계획 조건의 과거 잔액을 되살리지 않는다',async()=>{const detail={isOwned:true,hasTenant:false,address:'',loanAmount:100,tenantDeposit:0};const id=await createAsset({type:'REAL_ESTATE',name:'home',acquisitionDate:today(),acquisitionPrice:1000,detail});const p=blankPlan();p.debts=[debtSchema.parse({id:'loan:'+id,name:'loan',kind:'loan',assetId:id,balance:100,repayment:'interestOnly',interestRate:0})];await savePlan(p,0);await updateAsset(id,{detail:{...detail,loanAmount:0}});expect((await loadContext()).current.debts[0].balance).toBe(0)})
    it('자산을 처분했다고 남은 실제 부채를 자동 소멸시키지 않는다',async()=>{const id=await createAsset({type:'REAL_ESTATE',name:'sold home',acquisitionDate:'2020-01-01',acquisitionPrice:1000,disposalDate:today(),detail:{isOwned:true,hasTenant:false,address:'',loanAmount:100,tenantDeposit:0}});const c=await loadContext();expect(c.current.positions.find(p=>p.assetId===id)).toBeUndefined();expect(c.current.debts[0].balance).toBe(100)})
    it('시세 보정은 미리 본 날짜만 수정하고 현재 수량·평가액을 보존하며 되돌릴 수 있다', async () => { const id = await create(), before = (await db.assetHistory.where('assetId').equals(id).first())!; const original = await getAssetById(id); const after = { ...before, price: 200, value: 2000 }; await applyStockPriceCorrection({ assets: 1, failed: [], from: today(), to: today(), changes: [{ before, after }] }); expect(await getAssetById(id)).toMatchObject({ quantity: original!.quantity, currentValue: original!.currentValue }); expect((await db.assetHistory.get(before.id!))?.price).toBe(200); await undoStockPriceCorrection(); expect(await db.assetHistory.get(before.id!)).toEqual(before); });
    it('시세 보정 후 다른 수정이 있으면 되돌리기로 덮어쓰지 않는다', async () => { const id = await create(), before = (await db.assetHistory.where('assetId').equals(id).first())!, after = { ...before, price: 200, value: 2000 }; await applyStockPriceCorrection({ assets: 1, failed: [], from: today(), to: today(), changes: [{ before, after }] }); await db.assetHistory.update(before.id!, { price: 300 }); await expect(undoStockPriceCorrection()).rejects.toThrow('변경'); expect((await db.assetHistory.get(before.id!))?.price).toBe(300); });
    beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())); });
    it('빈 DB를 읽어도 샘플·가구·기존 계획을 생성하지 않는다', async () => { const c = await loadContext(); expect(c.hasPlan).toBe(false); expect(c.plan.people).toHaveLength(1); expect(await db.assets.count()).toBe(0); expect(await db.settings.count()).toBe(0); });
    it('같은 버전의 동시 저장은 한 번만 성공, 다른 초안은 보존', async () => { const p = blankPlan(); await saveDraft('tab', p); const r = await Promise.allSettled([savePlan(p, 0), savePlan({ ...p, inflation: 2 }, 0)]); expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(await readDraft('tab')).toEqual(p); });
    it('저장 분석은 자산 갱신 후에도 기존 잔액·가정을 유지하고 반복 계산은 보관본을 덮어쓰지 않음', async () => { const id = await create(), p = { ...blankPlan(), endDate: '2027-12-31', inflation: 0 }; p.policies = [policySchema.parse({ assetId: id, role: 'investment', confirmed: true, annualGrowth: 0, dividendYield: 0 })]; await savePlan(p, 0); const first = await calculateAndSave(baseScenario); const stored = await db.table('plannerRuns').get(first.id); await calculateAndSave(baseScenario); expect(await db.table('plannerRuns').get(first.id)).toEqual(stored); await updateAsset(id, { name: 'renamed' }); const latest = await loadContext(); expect(latest.snapshot.assetRevision).not.toBe(first.snapshot.assetRevision); expect((await db.table('plannerRuns').get(first.id)).snapshot.positions[0].name).toBe('synthetic'); });
    it('v2 백업은 모든 원본과 저장 분석을 왕복 보존', async () => { await create(); await savePlan({ ...blankPlan(), endDate: '2027-12-31' }, 0); await calculateAndSave(baseScenario); const backup = await exportBackup(); await importBackup(backup); expect((await exportBackup()).tables).toEqual(backup.tables); });
    it('불완전·잘못된 타입·고아 참조는 삭제 전에 거부', async () => { await create(); const before = await exportBackup(); for (const mutate of [(b: any) => delete b.tables.realEstateDetails, (b: any) => b.tables.assets[0].currentValue = '100', (b: any) => b.tables.stockDetails[0].assetId = 'missing', (b: any) => b.tables.assets.push({ ...b.tables.assets[0] })]) {
        const bad = structuredClone(before);
        mutate(bad);
        await expect(importBackup(bad)).rejects.toThrow();
        expect((await exportBackup()).tables).toEqual(before.tables);
    } });
    it('복원 미리보기 뒤 변경이 생기면 중단, 복원 직전 사본으로 되돌리기', async () => { const id = await create(), backup = await exportBackup(), preview = await previewBackup(backup); await updateAsset(id, { name: 'edited' }); await expect(importBackup(preview.data, preview.expected)).rejects.toThrow('변경'); await importBackup(backup); expect((await getAssetById(id))?.name).toBe('synthetic'); await restorePreviousImport(); expect((await getAssetById(id))?.name).toBe('edited'); });
    it('완전한 v1 백업을 읽되 누락된 새 계획은 별도 생성하지 않음', async () => { await create(); const b = await exportBackup(); b.version = 1; for (const k of ['plannerPlans', 'plannerRuns', 'plannerDrafts'])
        delete b.tables[k]; await importBackup(b); expect(await db.assets.count()).toBe(1); expect(await db.table('plannerPlans').count()).toBe(0); });
    it('오래된 시세 응답·실패는 현재 값을 덮어쓰지 않고 최신 수량 유지', async () => { const id = await create(); await beginQuoteRequest([id], 'old'); await beginQuoteRequest([id], 'new'); expect(await applyQuoteObservation(id, 'TEST', 200, today(), 'old')).toBe(false); await updateAsset(id, { quantity: 20 }); expect(await applyQuoteObservation(id, 'TEST', 200, today(), 'new')).toBe(true); const a = await getAssetById(id); expect(a?.quantity).toBe(20); expect(a?.currentValue).toBe(4000); expect(a?.acquisitionPrice).toBe(100); await beginQuoteRequest([id], 'failed'); expect(await applyQuoteObservation(id, 'TEST', null, today(), 'failed')).toBe(false); expect((await getAssetById(id))?.currentValue).toBe(4000); });
    it('같은 날 반복 시세는 이력을 중복 생성하지 않음', async () => { const id = await create(); await beginQuoteRequest([id], 'quote'); await applyQuoteObservation(id, 'TEST', 200, today(), 'quote'); await applyQuoteObservation(id, 'TEST', 200, today(), 'quote'); expect(await db.assetHistory.where('assetId').equals(id).count()).toBe(1); });
    it('과거 수량 수정은 이후 실제 거래 기록으로 전파하지 않음', async () => { const id = await create(); await addHistory(id, { date: '2027-01-01', quantity: 20, price: 100 }); await updateHistory(id, today(), { quantity: 5, price: 100 }); expect((await getAssetById(id))?.history.find(h => h.date === '2027-01-01')?.quantity).toBe(20); });
});
