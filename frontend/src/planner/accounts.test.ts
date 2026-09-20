import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types';
import { accountName, stockAccounts, stockAccountUrl, safeAssetReturn } from './accounts';
import { assetFlowPreview } from './storage';
import { blankPlan, buildSnapshot } from './model';
const stock=(id:string,name='account',extra={})=>({id,type:'STOCK',name:id,currentValue:100,quantity:1,acquisitionDate:'2020-01-01',acquisitionPrice:100,createdAt:'',updatedAt:'',ownership:{husband:100,wife:0},history:[],detail:{accountName:name,currency:'KRW',isPensionLike:false},...extra} as Asset);
describe('계좌 요약·이전 원천',()=>{
    it('종목 원본을 바꾸지 않고 계좌별로 묶으며 매각 종목은 현재 요약에서 제외',()=>{
        const assets=[stock('b'),stock('a'),stock('c','second'),stock('sold','account',{disposalDate:'2025-01-01'})],before=JSON.stringify(assets);
        const groups=stockAccounts(assets);expect(groups).toHaveLength(2);expect(groups[0].assets).toHaveLength(2);
        expect(groups[0].id).toBe('a');expect(JSON.stringify(assets)).toBe(before);
        expect(stockAccounts(assets.map(a=>({...a,detail:{...a.detail,accountName:'renamed'}} as Asset)))[0].id).toBe('a');
        expect(stockAccountUrl('a')).toBe('/assets?type=STOCK&account=a');expect(accountName(assets[0])).toBe('account');
    });
    it('복귀 주소는 로컬 자산 경로만 허용',()=>{
        expect(safeAssetReturn('/assets?type=STOCK&account=a&asset=b')).toBe('/assets?type=STOCK&account=a&asset=b');
        for(const url of ['https://example.com','//example.com','/assets/../../settings','/plan'])expect(safeAssetReturn(url)).toBe('/assets?type=ALL');
    });
    it('연금 미리보기는 원금 복사 없이 지급 원천과 전체 계좌의 자산 ID 목록을 연결',()=>{
        const assets=[stock('a'),stock('b'),stock('p','',{type:'PENSION',currentValue:0,detail:{pensionType:'irp',linkedStockId:'account',expectedMonthlyPayout:10,expectedStartYear:2027,expectedEndYear:2040,annualGrowthRate:0}})];
        const p=blankPlan('2026-01-01'),snapshot=buildSnapshot(assets,{currentAge:40,retirementAge:60},p,'2026-01-01T00:00:00Z'),before=JSON.stringify(snapshot);
        const next=assetFlowPreview(p,snapshot);expect(next.plan.flows[0]).toMatchObject({assetId:'p',amountSource:'assetPension',withdrawalAssetIds:['a','b'],withdrawalAccountAssetId:'a',confirmed:false});
        expect(JSON.stringify(snapshot)).toBe(before);expect(assetFlowPreview(next.plan,snapshot).plan.flows).toHaveLength(1);
        expect(assetFlowPreview(p,snapshot,'a').plan.flows).toHaveLength(0);
    });
});
