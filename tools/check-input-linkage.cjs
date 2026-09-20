const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'Missing input control: '+text);
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  async function set(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);}
  const ids=await dbEval(`
    await m.saveSettings({birthHusband:'1980.01',birthWife:'1982.01',retirementYear:2031});
    for(const a of await m.getAllAssets())await m.db.assets.update(a.id,{disposalDate:'2025-01-01'});
    const pension=await m.createAsset({type:'PENSION',name:'SYNTHETIC_WIFE_NATIONAL',acquisitionDate:'2020-01-01',acquisitionPrice:0,ownership:{husband:0,wife:100},detail:{pensionType:'NATIONAL',expectedMonthlyPayout:1000000,expectedStartYear:2031,expectedEndYear:2090}});
    const stock=await m.createAsset({type:'STOCK',name:'SYNTHETIC_GENERAL',acquisitionDate:'2020-01-01',acquisitionPrice:100000000,quantity:1,detail:{accountName:'SYNTHETIC_GENERAL',isAccountLevel:true,dividendYield:6,currency:'KRW'}});
    await m.saveStockAccountOwnership({SYNTHETIC_GENERAL:{husband:0,wife:100}});
    const {EMPTY_PENSION_PLAN}=await import('/src/lib/pensionSim.ts');
    await m.savePensionSim({...EMPTY_PENSION_PLAN,startYear:2031,refYear:2031,healthHouseholdMode:'joint',allocations:[],sources:[{id:pension,name:'SYNTHETIC_WIFE_NATIONAL',principal:0,taxType:'national',owner:'husband',yieldRate:0}],stockAccount:{husband:{extraAmount:900000000,growthRate:0,dividendYield:0},wife:{extraAmount:0,growthRate:0,dividendYield:0}}});
    await m.saveRetirement({retirementYear:2031,linkPensionSim:true,linkCorpSim:false,expenses:[{id:'e',name:'SYNTHETIC_EXPENSE',amount:1000000}],medicalMonthly:0,travel:[],lumpsum:[],emergency:[],holdingTaxAuto:false,holdingTaxAnnual:0,expenseInflationRate:undefined,expenseBaseYear:undefined});
    return {pension,stock};
  `);
  await navigate('/analysis','내 은퇴 분석');
  await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2031'"),'2031 ownership');
  await click('button[aria-controls=analysis-income]','월 수입');await click('#analysis-income summary','연금별 월수령액');
  assert(await evaluate(`document.querySelector('[data-pension-source="'+${JSON.stringify(ids.pension)}+'"]').innerText.includes('아내')`));
  assert.equal(await dbEval('return (await m.getPensionSim()).sources[0].owner'),'husband','Read must not mutate legacy plan');
  await navigate('/analysis?tab=pension-sim','개인투자시뮬');await click('button','일반주식계좌 (남편/와이프)');
  await set('select[aria-label="일반주식 입력 기준"]','assets');await click('button','저장');
  await until(()=>dbEval("return (await m.getPensionSim()).stockInputMode==='assets'"),'Linked stocks saved');
  assert.equal(await dbEval('return (await m.getPensionSim()).stockAccount.husband.extraAmount'),900000000,'Manual input preserved');
  assert.equal(await dbEval('return (await m.getPensionSim()).sources[0].owner'),'wife','Explicit save uses latest asset owner');
  await navigate('/analysis?tab=prep','은퇴 준비 (입력)');await click('button','생활비 / 여행 / 의료비');
  await set('input[aria-label="생활비 물가상승률"]','2');
  await set('input[aria-label="생활비 기준연도"]','2026');await click('button','저장');
  await until(()=>dbEval('return (await m.getRetirement()).expenseInflationRate===2'),'Inflation saved');
  const backup=await dbEval('return await m.exportBackup()');
  await dbEval('const b=await m.exportBackup();await m.importBackup(b)');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,backup.tables,'New settings survive backup');
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("!!document.querySelector('[data-analysis-year]')"),'Linked summary');
    const row=await evaluate("(()=>{const e=document.querySelector('[data-analysis-year]');return {income:Number(e.dataset.monthlyIncome),expense:Number(e.dataset.monthlyExpense),health:Number(document.querySelector('[data-health-summary]').dataset.monthlyHealth)}})()");
    assert.equal(row.income,1500000,'Wife pension plus current-account dividend, no manual capital duplication');
    assert(Math.abs(row.expense-(1000000*Math.pow(1.02,5)+row.health))<.01);
    await click('#analysis-expenses summary','생활비 상세');assert((await evaluate("document.querySelector('#analysis-expenses').innerText")).includes('110만원'));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await snapshot('input-linkage-analysis-'+width);
    await navigate('/analysis?tab=pension-sim','개인투자시뮬');await click('button','일반주식계좌 (남편/와이프)');
    assert(await evaluate("document.querySelector('[data-linked-stock-inputs]').innerText.includes('연결 계좌 1개')"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));await snapshot('input-linkage-stock-'+width);
  }
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,backup.tables,'Viewing all projections must not alter original inputs');
  await dbEval(`await m.db.assets.update(${JSON.stringify(ids.stock)},{currentValue:200000000})`);
  await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("Number(document.querySelector('[data-analysis-year]')?.dataset.monthlyIncome)===2000000"),'Valuation refresh updates dividend projection');
  console.log('INPUT_LINKAGE_UI=PASS; latest owner; read-only views; stocks select/save; no duplicate manual capital; current value refresh; inflation save/detail parity; backup roundtrip; desktop/mobile');
};
