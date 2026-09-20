import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db, createAsset, previewStockPriceCorrection, applyStockPriceCorrection, undoStockPriceCorrection, exportBackup, importBackup, getAssetById } from './db';
import { fetchStockHistory } from './stockPrice';
vi.mock('./stockPrice', () => ({ fetchStockHistory: vi.fn() }));
const stock = (currency = 'KRW') => createAsset({type:'STOCK',name:'synthetic',acquisitionDate:'2026-08-01',quantity:10,acquisitionPrice:100,detail:{ticker:'SYNTHETIC',currency:currency as 'KRW',accountName:'synthetic',isPensionLike:false}});
beforeEach(async () => { for (const t of db.tables) await t.clear(); vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-09-15T03:00:00Z')); vi.mocked(fetchStockHistory).mockReset(); });
afterEach(() => vi.useRealTimers());
describe('과거 시세 보정 안내와 무변경 보호', () => {
  it('동일 종목은 한 번 조회하고 계좌별 이력을 보정하며 진행 수를 알린다', async () => {
    const ids = [await stock(), await stock()];
    for (const assetId of ids) await db.assetHistory.add({assetId,date:'2026-08-20',price:100,quantity:10,value:1000});
    vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-20',close:120},{date:'2026-08-21',close:130}]);
    const progress:number[][]=[]; const p=await previewStockPriceCorrection(3,(d,t)=>progress.push([d,t]));
    expect(fetchStockHistory).toHaveBeenCalledTimes(1);expect(p.changes).toHaveLength(2);expect(p.additions).toHaveLength(2);expect(p.checked).toBe(4);expect(progress).toEqual([[0,2],[1,2],[2,2]]);
    expect(await db.assetHistory.filter(row=>row.date==='2026-08-21').count()).toBe(0);
  });
  it('시세 동일·대응 이력 없음·외화 제외를 조회 실패와 구분한다', async () => {
    const id=await stock();const empty=await stock();await db.assetHistory.where('assetId').equals(empty).delete();await stock('USD');
    await db.assetHistory.add({assetId:id,date:'2026-08-20',price:100,quantity:10,value:1000});
    vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-20',close:100}]);
    const p=await previewStockPriceCorrection();expect(p).toMatchObject({checked:1,unchanged:1,noHistory:1,excluded:1,failed:[],changes:[]});
  });
  it('조회 실패해도 진행이 끝나며 이력은 쓰지 않는다',async()=>{
    await stock();vi.mocked(fetchStockHistory).mockResolvedValue(null);const progress=vi.fn();const before=await db.assetHistory.toArray();
    const p=await previewStockPriceCorrection(3,progress);expect(p.failed).toHaveLength(1);expect(progress).toHaveBeenLastCalledWith(1,1);expect(await db.assetHistory.toArray()).toEqual(before);
  });
  it('변경 없음 적용 후에도 직전 보정을 되돌릴 수 있다',async()=>{
    const assetId=await stock();const id=await db.assetHistory.add({assetId,date:'2026-08-20',price:100,quantity:10,value:1000});
    const before=(await db.assetHistory.get(id))!;const after={...before,price:120,value:1200};
    await applyStockPriceCorrection({assets:1,failed:[],from:'2026-06-15',to:'2026-09-15',changes:[{before,after}]});
    await applyStockPriceCorrection({assets:0,failed:[],from:'2026-06-15',to:'2026-09-15',changes:[]});
    await undoStockPriceCorrection();expect(await db.assetHistory.get(id)).toEqual(before);
  });
  it('빈 거래일을 직전 실제 수량으로 추가하고 현재 자산은 보존하며 추가·보정을 함께 되돌린다',async()=>{
    const assetId=await stock();await db.assetHistory.add({assetId,date:'2026-08-20',price:100,quantity:20,value:2000});
    const original=await db.assetHistory.toArray(),asset=await db.assets.get(assetId);
    vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-19',close:120},{date:'2026-08-20',close:130},{date:'2026-08-21',close:140},{date:'2026-09-14',close:150}]);
    const p=await previewStockPriceCorrection();expect(p.additions?.map(h=>[h.date,h.quantity,h.quantitySourceDate])).toEqual([['2026-08-19',10,'2026-08-01'],['2026-08-21',20,'2026-08-20'],['2026-09-14',20,'2026-08-20']]);
    await applyStockPriceCorrection(p);expect(await db.assets.get(assetId)).toEqual(asset);expect(await db.assetHistory.count()).toBe(original.length+3);
    const repeat=await previewStockPriceCorrection();expect(repeat.additions).toHaveLength(0);expect(repeat.changes).toHaveLength(0);await applyStockPriceCorrection(repeat);
    await undoStockPriceCorrection();expect(await db.assetHistory.toArray()).toEqual(original);
  });
  it('취득 전·오늘·종가 없는 날짜는 만들지 않고 수량 0은 유지한다',async()=>{
    const assetId=await stock();await db.assetHistory.add({assetId,date:'2026-08-20',price:100,quantity:0,value:0});
    vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-07-31',close:100},{date:'2026-08-21',close:140},{date:'2026-08-22',close:0},{date:'2026-09-15',close:150}]);
    const p=await previewStockPriceCorrection();expect(p.additions).toHaveLength(1);expect(p.additions![0]).toMatchObject({date:'2026-08-21',quantity:0,value:0});
  });
  it('직전 기록의 수량이 미입력이면 오늘 수량이나 더 오래된 수량을 대신 쓰지 않는다',async()=>{
    const assetId=await stock();await db.assetHistory.add({assetId,date:'2026-08-20',quantity:null,value:1000});
    vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-21',close:140}]);const p=await previewStockPriceCorrection();expect(p.additions).toHaveLength(0);expect(p.missingQuantity).toBe(1);
  });
  it('미리보기 후 수량 원천이나 추가 날짜가 바뀌면 원자적으로 중단한다',async()=>{
    const assetId=await stock();vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-19',close:120}]);const p=await previewStockPriceCorrection();
    const source=(await db.assetHistory.where('assetId').equals(assetId).first())!;await db.assetHistory.update(source.id!,{quantity:30});
    await expect(applyStockPriceCorrection(p)).rejects.toThrow('변경');expect(await db.assetHistory.count()).toBe(1);
    const next=await previewStockPriceCorrection();await db.assetHistory.add({assetId,date:'2026-08-19',quantity:40,price:100,value:4000});
    await expect(applyStockPriceCorrection(next)).rejects.toThrow('변경');expect(await db.assetHistory.count()).toBe(2);
  });
  it('추가한 이력이 나중에 수정되면 되돌리기로 삭제하지 않는다',async()=>{
    const assetId=await stock();vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-19',close:120}]);await applyStockPriceCorrection(await previewStockPriceCorrection());
    const row=(await db.assetHistory.where('[assetId+date]').equals([assetId,'2026-08-19']).first())!;await db.assetHistory.update(row.id!,{quantity:11});
    await expect(undoStockPriceCorrection()).rejects.toThrow('변경');expect(await db.assetHistory.get(row.id!)).toMatchObject({quantity:11});
  });
  it('추정 수량 근거가 상세 화면과 백업 가져오기에 보존된다',async()=>{
    const assetId=await stock();vi.mocked(fetchStockHistory).mockResolvedValue([{date:'2026-08-19',close:120}]);await applyStockPriceCorrection(await previewStockPriceCorrection());
    expect((await getAssetById(assetId))!.history.find(h=>h.date==='2026-08-19')?.quantitySourceDate).toBe('2026-08-01');
    const backup=await exportBackup();await importBackup(backup);expect((await exportBackup()).tables).toEqual(backup.tables);
  });
});
