// Focused production UI check. Uses synthetic IndexedDB rows in an isolated Chrome profile.
const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,call,until,snapshot})=>{
  async function click(selector,text){
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert(p,'Missing interview control: '+text);
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  }
  const readPlan=`new Promise((resolve,reject)=>{const r=indexedDB.open('asset_manager_m');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const q=r.result.transaction('settings').objectStore('settings').get('pension_sim_plan');q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result?JSON.parse(q.result.value):null)}})`;
  await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('asset_manager_m');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['assets','pensionDetails'],'readwrite'),now=new Date().toISOString();tx.objectStore('assets').put({id:'socratic-irp',type:'PENSION',name:'문답 테스트 IRP',currentValue:100000000,acquisitionDate:'2020-01-01',acquisitionPrice:100000000,quantity:1,ownership:{husband:100,wife:0},createdAt:now,updatedAt:now});tx.objectStore('pensionDetails').put({assetId:'socratic-irp',pensionType:'IRP',expectedStartYear:2031,expectedEndYear:2050,expectedMonthlyPayout:1000000,annualGrowthRate:0});tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)}})`);
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis?tab=pension-sim#income-tax-settings','개인투자시뮬');
    await click('#income-tax-settings summary','IRP·사적연금의 인출 재원');
    if(width===1440){
      await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='funding'"),'First Socratic question');
      assert(await evaluate("document.querySelector('[data-irp-interview]').innerText.includes('무엇을 확인하나요?')"));
      assert.equal(await evaluate(readPlan),null,'Answers must not be saved before explicit save');
      await evaluate("document.querySelector('[data-irp-interview]').scrollIntoView({block:'center'})");
      await snapshot('irp-socratic-question-1440');
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Question must fit mobile viewport');
      await evaluate("document.querySelector('[data-irp-interview]').scrollIntoView({block:'start'})");
      await snapshot('irp-socratic-question-390');
      await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await click('[data-irp-interview] button','여러 종류가 섞임');
      await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='retirementPrincipal'"),'Retirement principal question');
      await click('[data-irp-interview] button','확인 결과 해당 없음');
      await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='exemptPrincipal'"),'Exempt principal question');
      await click('[data-irp-interview] button','확인 결과 해당 없음');
      await until(()=>evaluate("document.querySelector('[data-irp-question]')?.dataset.irpQuestion==='lifetime'"),'Contract question');
      await click('[data-irp-interview] button','아니요 · 일반 IRP/기간형');
      await until(()=>evaluate("document.querySelector('[data-irp-interview]').innerText.includes('모두 처리했습니다')"),'Interview completed');
      assert.equal(await evaluate(readPlan),null,'Completing answers still requires Save');
      await click('[data-irp-interview] button','답변을 실제 데이터에 저장');
      await until(async()=>{const p=await evaluate(readPlan);return p?.incomeTaxSettings?.sources?.['socratic-irp']?.lifetime===false},'Interview persisted');
      const stored=await evaluate(readPlan),tax=stored.incomeTaxSettings.sources['socratic-irp'];
      assert.deepEqual(tax,{fundingKind:'mixed',retirementPrincipal:0,exemptPrincipal:0,lifetime:false});
    }else{
      await until(()=>evaluate("!!document.querySelector('[data-irp-interview]')"),'Interview after reload');
      const state=await evaluate("({kind:document.querySelector('[data-irp-question]')?.dataset.irpQuestion??null,text:document.querySelector('[data-irp-interview]').textContent})");
      assert(state.text.includes('모두 처리했습니다'),'Saved answers should skip questions after reload; remaining='+state.kind);
    }
    await evaluate("document.querySelector('[data-irp-interview]').closest('details').open=true");
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Interview must fit viewport');
    await evaluate("document.querySelector('[data-irp-interview]').scrollIntoView({block:'center'})");
    await snapshot('irp-socratic-'+width);
  }
  console.log('IRP_SOCRATIC_UI=PASS; one question at a time; evidence help; explicit zero/false; explicit save; desktop/mobile');
};
