const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'Missing income-tax control: '+text);
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  async function input(label,value){await evaluate(`(()=>{const e=document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(label)})+']');if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);}
  const data=await dbEval(`
    await m.saveSettings({birthHusband:'1966.01',birthWife:'1968.01',retirementYear:2031});
    const pub=await m.createAsset({type:'PENSION',name:'TEST_PUBLIC',acquisitionDate:'2020-01-01',acquisitionPrice:0,ownership:{husband:100,wife:0},detail:{pensionType:'NATIONAL',expectedMonthlyPayout:1000000,expectedStartYear:2031,expectedEndYear:2070}});
    const ret=await m.createAsset({type:'PENSION',name:'TEST_IRP',acquisitionDate:'2020-01-01',acquisitionPrice:240000000,currentValue:240000000,ownership:{husband:100,wife:0},detail:{pensionType:'IRP',expectedMonthlyPayout:1000000,expectedStartYear:2031,expectedEndYear:2050}});
    const {EMPTY_PENSION_PLAN}=await import('/src/lib/pensionSim.ts');
    await m.savePensionSim({...EMPTY_PENSION_PLAN,sources:[],allocations:[],startYear:2031,refYear:2031,stockInputMode:'manual',healthHouseholdMode:'joint',stockAccount:{husband:{extraAmount:100000000,growthRate:0,dividendYield:100},wife:{extraAmount:0,growthRate:0,dividendYield:0}}});
    await m.saveRetirement({retirementYear:2031,linkPensionSim:true,linkCorpSim:false,expenses:[],medicalMonthly:0,travel:[],lumpsum:[],emergency:[],holdingTaxAuto:false,holdingTaxAnnual:0});
    return {pub,ret};
  `);
  await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-financial-tax-total]')"),'initial tax');
  assert(await evaluate("document.querySelector('#analysis-tax>summary').innerText.includes('미확정')"),'Unknown IRP must not appear tax-free');
  await click('#analysis-tax>summary','세금 상세');await click('[data-financial-tax-total]>summary','종합세금');
  assert(await evaluate("document.querySelector('[data-tax-field=additional][data-unresolved=true]')?.innerText.includes('미확정')"),'Unknown pension must not produce an apparently confirmed refund');
  await navigate('/analysis?tab=pension-sim#income-tax-settings','개인투자시뮬');
  await until(()=>evaluate("!!document.querySelector('#income-tax-settings[open]')"),'Tax editor deep-link opens');
  await click('#income-tax-settings summary','IRP·사적연금의 인출 재원');
  await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='funding'"),'IRP interview starts with source');
  assert(await evaluate("document.querySelector('[data-irp-interview]').innerText.includes('무엇을 확인하나요?')"),'Interview explains how to find an unknown answer');
  await click('[data-irp-interview] button','여러 종류가 섞임');
  await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='retirementPrincipal'"),'Interview asks retirement principal');
  await click('[data-irp-interview] button','확인 결과 해당 없음');
  await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='exemptPrincipal'"),'Interview asks exempt principal');
  await click('[data-irp-interview] button','확인 결과 해당 없음');
  await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='lifetime'"),'Interview asks contract type only for personal funding');
  await click('[data-irp-interview] button','아니요 · 일반 IRP/기간형');
  await until(()=>evaluate("document.querySelector('[data-irp-interview]').innerText.includes('모두 처리했습니다')"),'Interview completes one question at a time');
  assert.equal(await dbEval(`const p=(await m.getPensionSim()).incomeTaxSettings?.sources?.[${JSON.stringify(data.ret)}];return p`),undefined,'Interview changes are not silently persisted before Save');
  await input('남편 배당공제 대상 비율 (%)',100);await input('남편 국민연금 과세대상 비율 (%)',100);
  await input('남편 인적·기타 소득공제 합계 (원/년)',1500000);await input('아내 배당공제 대상 비율 (%)',0);
  await click('#income-tax-settings summary','IRP·사적연금의 인출 재원');
  await input('TEST_IRP 현재 잔액 재원 구분','retirement');
  await input('TEST_IRP 이연퇴직소득세율 (국세 %)',10);await input('TEST_IRP 실제 첫 수령연도',2031);
  await click('#income-tax-settings summary','해외세금·실제 기납부액');
  await input('남편 전체 국내 기납부세액 (국세+지방세) (원)',20000000);
  await click('button','저장');
  await until(()=>dbEval('return (await m.getPensionSim()).incomeTaxSettings?.years?.[2031]?.husband?.domesticWithholding===20000000'),'Tax settings save');
  assert.equal(await dbEval(`return (await m.getPensionSim()).incomeTaxSettings.sources[${JSON.stringify(data.ret)}].retirementTaxRate`),10);
  const before=(await dbEval('return await m.exportBackup()')).tables;
  await dbEval('const b=await m.exportBackup();await m.importBackup(b)');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,before,'Tax settings backup roundtrip');
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("Number(document.querySelector('[data-financial-tax-total]')?.dataset.financialTaxTotal)===16627600"),'Combined annual result');
    await click('#analysis-tax>summary','세금 상세');await click('[data-financial-tax-total]>summary','종합세금');
    await click('[data-financial-tax-owner=husband] summary','계산 근거');
    const result=await evaluate("Object.fromEntries([...document.querySelectorAll('[data-financial-tax-owner=husband] [data-tax-field]')].map(e=>[e.dataset.taxField,Number(e.dataset.amount)]))");
    assert.equal(result['pension-deduction'],5900000);assert.equal(result['gross-up'],8000000);assert.equal(result['dividend-credit'],5494000);
    assert.equal(result['retirement-tax'],924000);assert.equal(result.withholding,20000000);assert.equal(result.additional,-3372400);
    assert.equal(result.total,result.withholding+result.additional);
    assert.equal(await evaluate("Number(document.querySelector('[data-analysis-year]').dataset.annualTax)"),result.total);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await snapshot('income-tax-'+width);
    await navigate('/analysis?tab=pension-sim','개인투자시뮬');await until(()=>evaluate("Number(document.querySelector('[data-financial-tax-total]')?.dataset.financialTaxTotal)===16627600"),'Vehicle tax parity');
    await click('#income-tax-settings>summary','세금 추가정보');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"남편 배당공제 대상 비율 (%)\"]').value"),'100');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));
  }
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,before,'Tax views are read-only');
  await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'Ready to change year');
  await click('button[aria-label="다음 연도"]','');
  await until(()=>evaluate("document.querySelector('[data-analysis-year]').dataset.analysisYear==='2032'"),'2032 tax');
  assert.notEqual(await evaluate("Number(document.querySelector('[data-financial-tax-owner=husband] [data-tax-field=withholding]').dataset.amount)"),20000000,'Actual prior-year withholding must not repeat');
  const personalId=await dbEval(`
    const id=await m.createAsset({type:'PENSION',name:'TEST_PERSONAL_IRP',acquisitionDate:'2020-01-01',acquisitionPrice:60000000,currentValue:60000000,ownership:{husband:100,wife:0},detail:{pensionType:'IRP',expectedMonthlyPayout:1000000,expectedStartYear:2031,expectedEndYear:2050}});
    const retirement=await m.getRetirement();await m.saveRetirement({...retirement,lumpsum:[{id:'test-lump',name:'TEST_LUMP',amount:450000000,receiveYear:2031,taxKind:'severance'}]});
    const plan=await m.getPensionSim();await m.savePensionSim({...plan,allocations:[{lumpsumId:'test-lump',irpSourceId:${JSON.stringify(data.ret)},irpAmount:450000000,stockAmount:0}]});
    return id;
  `);
  await navigate('/analysis?tab=pension-sim#income-tax-settings','개인투자시뮬');
  await click('#income-tax-settings summary','IRP·사적연금의 인출 재원');
  await input('TEST_PERSONAL_IRP 현재 잔액 재원 구분','personal');
  await input('TEST_IRP 합칠 계좌',personalId);await input('TEST_IRP 합칠 연도',2031);
  await input('TEST_LUMP 이연퇴직소득세율 (국세 %)',5);
  await click('button','저장');
  await until(()=>dbEval('return (await m.getPensionSim()).irpTransfers?.[0]?.year===2031'),'IRP merge save');
  assert.equal(await dbEval('return (await m.getPensionSim()).allocations[0].irpRetirementTaxRate'),5);
  const mergedBackup=(await dbEval('return await m.exportBackup()')).tables;
  await dbEval('const b=await m.exportBackup();await m.importBackup(b)');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,mergedBackup,'Funding/transfer backup roundtrip');
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis?tab=pension-sim','개인투자시뮬');
    await click('[data-pension-ledger]>summary','연금 계좌');
    await click('[data-pension-ledger] button','2031년 내역');
    const details=await evaluate(`(()=>{const root=document.querySelector('[data-pension-ledger]');return {old:!!root.querySelector('[data-pension-source="${data.ret}"]'),funding:root.querySelector('[data-pension-funding="${personalId}"]')?.innerText,accounts:root.innerText}})()`);
    assert.equal(details.old,false,'Merged source must not pay twice');
    assert(details.funding?.includes('퇴직금'),'Merged account exposes withdrawal funding');
    assert(details.accounts.includes('내부이전'),'Internal transfer is not external income');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    assert(await evaluate("(()=>{const e=document.querySelector('#pension-year-2031>div');return e.getBoundingClientRect().right<=innerWidth&&e.scrollWidth<=e.clientWidth+1})()"),'Funding details must fit without horizontal clipping');
    await snapshot('irp-funding-'+width);
  }
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,mergedBackup,'Funding views are read-only');
  await require('./check-backup-ui.cjs')({navigate,evaluate,dbEval,call,until,snapshot});
  console.log('INCOME_TAX_UI=PASS; tax parity; funding flags; IRP transfer; separate lump tax rate; no duplicate payout; backup roundtrip; desktop/mobile');
};
