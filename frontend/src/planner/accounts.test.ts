import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types';
import { accountName, stockAccounts, stockAccountUrl, safeAssetReturn, linkedAccountOf, linkedAccountNames, pensionAccountNames, accountTotal, linkedWrapperInfo, assetLabel, pensionKind } from './accounts';
import { assetFlowPreview } from './storage';
import { blankPlan, buildSnapshot, defaultPolicy, resolvePolicy } from './model';
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

// 2단계 — 연결 연금(linkedStockId) 해석·표시 헬퍼
describe('연결 연금 래퍼 해석·표시',()=>{
    const pension=(id:string,extra={})=>({id,type:'PENSION',name:id,currentValue:0,quantity:1,acquisitionDate:'2020-01-01',acquisitionPrice:0,createdAt:'',updatedAt:'',ownership:{husband:100,wife:0},history:[],detail:{pensionType:'IRP'} as never,...extra} as Asset);
    const account=[stock('a','퇴직IRP'),stock('b','퇴직IRP')];
    it('linkedAccountOf — 계좌명(trim) 또는 계좌 안 종목 id 로 해석, 아니면 undefined',()=>{
        const groups=stockAccounts(account);
        expect(linkedAccountOf(pension('w',{detail:{pensionType:'IRP',linkedStockId:'퇴직IRP'}}),groups)?.name).toBe('퇴직IRP');
        expect(linkedAccountOf(pension('w',{detail:{pensionType:'IRP',linkedStockId:' 퇴직IRP '}}),groups)?.name).toBe('퇴직IRP');
        expect(linkedAccountOf(pension('w',{detail:{pensionType:'IRP',linkedStockId:'a'}}),groups)?.name).toBe('퇴직IRP');
        expect(linkedAccountOf(pension('w',{detail:{pensionType:'IRP',linkedStockId:'없는계좌'}}),groups)).toBeUndefined();
        expect(linkedAccountOf(pension('w'),groups)).toBeUndefined();
        expect(linkedAccountOf(account[0],groups)).toBeUndefined();
    });
    it('linkedAccountNames — 연결 연금이 가리키는 계좌명 집합 (매각 래퍼 제외)',()=>{
        const wrapper=pension('w',{detail:{pensionType:'IRP',linkedStockId:'퇴직IRP'}});
        expect([...linkedAccountNames([...account,wrapper])]).toEqual(['퇴직IRP']);
        expect(linkedAccountNames([...account,{...wrapper,disposalDate:'2025-01-01'}]).size).toBe(0);
    });
    it('accountTotal — 계좌 통합 행이 있으면 그 행만 합산 (종목 중복 합산 방지)',()=>{
        const mixed=[stock('a','계좌'),stock('b','계좌'),stock('agg','계좌',{currentValue:500,detail:{accountName:'계좌',currency:'KRW',isAccountLevel:true}})];
        expect(accountTotal(stockAccounts(mixed)[0])).toBe(500);
        expect(accountTotal(stockAccounts(account)[0])).toBe(200);
    });
    it('linkedWrapperInfo — 계좌 합계·원본 이력·불일치 여부',()=>{
        const wrapper=pension('w',{currentValue:300_000_000,detail:{pensionType:'IRP',linkedStockId:'퇴직IRP'},history:[{date:'2025-01-01',value:280_000_000},{date:'2026-04-22',value:300_000_000},{date:'2026-05-01',value:0}]});
        const info=linkedWrapperInfo(wrapper,[...account,wrapper])!;
        expect(info).toMatchObject({accountName:'퇴직IRP',accountTotal:200,lastHistory:{date:'2026-04-22',value:300_000_000},mismatch:true});
        // 평가액 0(정상 연결)이면 불일치 아님, 연결이 없으면 null
        expect(linkedWrapperInfo({...wrapper,currentValue:0},[...account,wrapper])!.mismatch).toBe(false);
        expect(linkedWrapperInfo(pension('plain'),[...account])).toBeNull();
    });
    it('assetLabel — 주식은 "종목명 · 계좌명", 그 외는 이름',()=>{
        expect(assetLabel(stock('s',' 퇴직IRP '))).toBe('s · 퇴직IRP');
        expect(assetLabel(pension('연금저축'))).toBe('연금저축');
    });
    it('pensionKind — pensionType 우선, 이름의 보험은 보조 판정 (표시 전용)',()=>{
        expect(pensionKind(pension('np',{detail:{pensionType:'NATIONAL'}}))).toBe('national');
        expect(pensionKind(pension('np2',{detail:{pensionType:'국민연금'}}))).toBe('national');
        expect(pensionKind(pension('생명보험',{detail:{pensionType:'보험'}}))).toBe('insurance');
        expect(pensionKind(pension('irp',{detail:{pensionType:'IRP'}}))).toBe('pension');
        expect(pensionKind(pension('화재연금보험',{detail:{pensionType:'PERSONAL'}}))).toBe('insurance');
        expect(pensionKind(pension('연금저축',{detail:{pensionType:'PERSONAL'}}))).toBe('pension');
    });
});

// 2단계b — IRP 계좌 주식 기본 role 'pension' (저장 정책 우선, 스냅샷·정책 편집기 같은 기본값)
describe('IRP 계좌 주식 기본 분류',()=>{
    const pension=(id:string,extra={})=>({id,type:'PENSION',name:id,currentValue:0,quantity:1,acquisitionDate:'2020-01-01',acquisitionPrice:0,createdAt:'',updatedAt:'',ownership:{husband:100,wife:0},history:[],detail:{pensionType:'IRP'} as never,...extra} as Asset);
    const irp=[stock('a','미래에셋-퇴직IRP'),stock('b','미래에셋-퇴직IRP')],normal=stock('c','토스증권');
    it('pensionAccountNames — 계좌명 /irp/i ∪ 연결 연금이 가리키는 계좌 (이름에 IRP 없어도 연결 대상이면 포함)',()=>{
        expect([...pensionAccountNames([...irp,normal])]).toEqual(['미래에셋-퇴직IRP']);
        expect([...pensionAccountNames([normal,pension('w',{detail:{pensionType:'IRP',linkedStockId:'토스증권'}})])]).toEqual(['토스증권']);
        expect(pensionAccountNames([stock('d',' 일반IRP '),stock('e','irp-개인')]).size).toBe(2); // trim·대소문자 무관
    });
    it('defaultPolicy — 연금 계좌 주식은 pension, 일반 계좌는 investment, 문맥 생략 시 종전대로 investment',()=>{
        const ctx=pensionAccountNames([...irp,normal]);
        expect(defaultPolicy(irp[0],ctx).role).toBe('pension');
        expect(defaultPolicy(normal,ctx).role).toBe('investment');
        expect(defaultPolicy(irp[0]).role).toBe('investment');
    });
    it('resolvePolicy — 저장 정책이 항상 우선 (저장된 investment 는 investment 유지, A안)',()=>{
        const ctx=pensionAccountNames(irp),saved={...defaultPolicy(irp[0]),role:'investment' as const};
        expect(resolvePolicy(irp[0],[saved],ctx).role).toBe('investment');
        expect(resolvePolicy(irp[0],[],ctx).role).toBe('pension');
    });
    it('buildSnapshot 도 같은 기본값 — 정책 편집기(policyList 의 resolvePolicy)와 스냅샷이 어긋나지 않음',()=>{
        const snap=buildSnapshot([...irp,normal],{currentAge:40,retirementAge:60},blankPlan('2026-01-01'),'2026-01-01T00:00:00Z');
        expect(snap.positions.find(p=>p.assetId==='a')?.role).toBe('pension');
        expect(snap.positions.find(p=>p.assetId==='c')?.role).toBe('investment');
    });
});
