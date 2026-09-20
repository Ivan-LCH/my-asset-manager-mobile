const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'IRP control missing: '+text);
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  async function checkHealthSummary(label,separate=false){
    const v=await evaluate(`(()=>{const s=document.querySelector('[data-health-summary]'),d=document.querySelector('[data-health-breakdown]');s.scrollIntoView({block:'center'});return {open:s.parentElement.open,visible:s.checkVisibility(),text:s.innerText,total:Number(s.dataset.monthlyHealth),detail:Number(d.dataset.monthlyHealth),people:[...s.querySelectorAll('[data-health-person-summary]')].map(e=>Number(e.dataset.healthPersonSummary)),premiums:[...d.querySelectorAll('[data-health-premium]')].map(e=>Number(e.dataset.healthPremium))}})()`);
    assert.equal(v.open,false,'Health amount must be visible before expanding');assert(v.visible);
    assert(v.text.includes(label),v.text);assert(Number.isFinite(v.total));
    assert(v.text.includes('₩'+Math.round(v.total).toLocaleString('ko-KR')));
    assert.equal(v.total,v.detail,'Summary and breakdown must use the same monthly total');
    assert.equal(v.premiums.reduce((a,b)=>a+b,0),v.total);
    assert.equal(v.people.length,separate?2:0,'Do not invent individual premiums for a joint household');
    if(separate)assert.equal(v.people.reduce((a,b)=>a+b,0),v.total);
    const detail=await evaluate("document.querySelector('[data-health-breakdown]').textContent");
    assert(!detail.includes('₩'+Math.round(v.total).toLocaleString('ko-KR')+'/월'),'Do not repeat the household monthly total inside the detail');
    assert.equal(await evaluate("document.querySelector('[data-health-individual-reference]').dataset.healthIndividualReference"),separate?'false':'true');
    if(!separate){assert(detail.includes('개인별 참고액'));assert(detail.includes('실제 개인별 고지액이나 세대 보험료의 배분액이 아닙니다'));}
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  const id=await dbEval(`
    await m.savePortfolio({growthRate:0,dividendYield:0});
    const stock=await m.createAsset({type:'STOCK',name:'SYNTHETIC_IRP_ACCOUNT',acquisitionDate:'2020-01-01',acquisitionPrice:300000000,quantity:1,detail:{accountName:'SYNTHETIC_IRP_ACCOUNT',isAccountLevel:true,currency:'KRW',isPensionLike:false}});
    await m.db.assets.update(stock,{currentValue:300000000});
    const id=await m.createAsset({type:'PENSION',name:'SYNTHETIC_LINKED_IRP',acquisitionDate:'2020-01-01',acquisitionPrice:300000000,detail:{pensionType:'IRP',linkedStockId:'SYNTHETIC_IRP_ACCOUNT',expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:1650000,annualGrowthRate:0}});
    const {EMPTY_PENSION_PLAN}=await import('/src/lib/pensionSim.ts');
    const {pensionInputs}=await import('/src/lib/analysisInputs.ts');
    await m.savePensionSim(pensionInputs({...EMPTY_PENSION_PLAN,startYear:2029,refYear:2031,withdrawalYears:20,sources:[],allocations:[{lumpsumId:'synthetic-retirement',irpAmount:450000000,stockAmount:0}]},await m.getAllAssets()));
    await m.saveRetirement({retirementYear:2031,linkPensionSim:true,linkCorpSim:false,lumpsum:[{id:'synthetic-retirement',name:'SYNTHETIC_RETIREMENT',amount:450000000,receiveYear:2031,taxKind:'severance'}]});return id;
  `);
  await navigate('/analysis','내 은퇴 분석');
  await until(()=>evaluate("document.querySelector('[data-analysis-notices]')?.innerText.includes('IRP 연결 확인 필요')"),'unlinked allocation must be visible');
  await checkHealthSummary('가입 형태 미확인');
  await click('#analysis-health summary','건강보험');
  const initialHealth=await evaluate("document.querySelector('[data-health-breakdown]').innerText");
  assert(initialHealth.includes('직장가입자·피부양자이면 이 추정액을 사용할 수 없습니다'));
  await navigate('/analysis?tab=pension-sim','개인투자시뮬');
  await until(()=>evaluate("!!document.querySelector('select[aria-label=\"SYNTHETIC_RETIREMENT 합산할 퇴직IRP\"]')"),'IRP selector');
  await evaluate(`(()=>{const e=document.querySelector('select[aria-label="SYNTHETIC_RETIREMENT 합산할 퇴직IRP"]');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await click('button','과세·수령 기준');
  assert(!(await evaluate("document.querySelector('main').innerText")).includes('30년 고정'));
  assert(await evaluate("[...document.querySelectorAll('input')].some(e=>e.checkVisibility()&&e.value==='20')"));
  await evaluate("(()=>{const e=document.querySelector('select[aria-label=\"건강보험 가입 가정\"]');e.value='joint';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await click('button','저장');
  await until(()=>dbEval(`return (await m.getPensionSim()).allocations[0].irpSourceId===${JSON.stringify(id)}`),'IRP link saved');
  const exported=await dbEval('return await m.exportBackup()');
  const saved=JSON.parse(exported.tables.settings.find(s=>s.key==='pension_sim_plan').value);
  assert.equal(saved.healthHouseholdMode,'joint');assert.equal(saved.withdrawalYears,20);
  await dbEval(`const b=await m.exportBackup();await m.importBackup(b)`);
  assert.equal(await dbEval('return (await m.getPensionSim()).allocations[0].irpSourceId'),id,'IRP link survives backup round trip');
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2031'"),'2031 summary');
    await checkHealthSummary('같은 지역가입 세대 · 세대 합산');
    await snapshot('health-joint-collapsed-'+width);
    await click('button[aria-controls=analysis-income]','월 수입');await click('#analysis-income summary','연금별 월수령액');
    assert.equal(await evaluate(`Number(document.querySelector('[data-pension-source="'+${JSON.stringify(id)}+'"]').dataset.paidAnnual)`),49500000);
    assert(await evaluate("document.querySelector('[data-pension-payout-change]').innerText.includes('4,125,000')"));
    await click('#analysis-health summary','건강보험');
    assert(await evaluate("document.querySelector('[data-health-breakdown]').innerText.includes('IRP·사적연금 지급')"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector("main").scrollWidth<=document.querySelector("main").clientWidth+1'));
    await snapshot('irp-linked-analysis-'+width);
    await click('[data-pension-ledger] summary','연금 계좌');await click('[data-pension-ledger] button','2031년 내역');
    assert(await evaluate("document.querySelector('#pension-year-2031').innerText.includes('합산')"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  await navigate('/analysis?tab=pension-sim','개인투자시뮬');
  await click('button','과세·수령 기준');
  await evaluate("(()=>{const e=document.querySelector('select[aria-label=\"건강보험 가입 가정\"]');e.value='separate';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await click('button','저장');
  await until(()=>dbEval("return (await m.getPensionSim()).healthHouseholdMode==='separate'"),'Separate households saved');
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2031'"),'Separate 2031 summary');
    await checkHealthSummary('별도 지역가입 세대',true);
    await snapshot('health-separate-collapsed-'+width);
    await click('#analysis-health summary','건강보험');
    assert(await evaluate("document.querySelector('[data-health-breakdown]').innerText.includes('남편 세대')&&document.querySelector('[data-health-breakdown]').innerText.includes('아내 세대')"));
    await click('#analysis-health summary','건강보험');
    await click('button[aria-label="다음 연도"]','');
    await until(()=>evaluate("document.querySelector('[data-analysis-year]')?.dataset.analysisYear==='2032'"),'2032 summary');
    await checkHealthSummary('별도 지역가입 세대',true);
  }
  const original=JSON.stringify((await dbEval('return await m.exportBackup()')).tables);
  await navigate('/analysis?tab=cashflow','은퇴 생활비 계획');await navigate('/analysis?tab=pension-sim','개인투자시뮬');
  assert.equal(JSON.stringify((await dbEval('return await m.exportBackup()')).tables),original,'Viewing projection must not mutate inputs');
  console.log('IRP_LINK_UI=PASS; select/save; 20-year visibility; 300m+450m same account; 1.65m->4.125m; income drilldown; collapsed health totals; joint/separate/unconfirmed health; yearly reconciliation; backup roundtrip; desktop/mobile; read-only views');
};
