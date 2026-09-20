// Only called in a disposable profile with intercepted synthetic historical prices.
const assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until})=>{
  async function click(selector,text){
    const point=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility()&&e.textContent.includes(${JSON.stringify(text)}));if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert(point,'Backfill control unavailable');
    for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  }
  const before=await dbEval('return await m.exportBackup()');
  await navigate('/settings','설정');await click('summary','과거 기록 보정');await click('button','최근 3개월 시세 소급 업데이트');
  await until(()=>evaluate("document.querySelector('main').innerText.includes('완료 — 추가')"),'backfill additions applied');
  const after=await dbEval('return await m.exportBackup()');
  const oldKeys=new Set(before.tables.assetHistory.map(h=>h.assetId+':'+h.date));
  const added=after.tables.assetHistory.filter(h=>!oldKeys.has(h.assetId+':'+h.date));
  assert(added.length>0,'No missing trading days inserted');
  assert(added.every(h=>h.quantitySourceDate&&h.quantitySourceDate<h.date),'Missing quantity provenance');
  for(const [table,rows]of Object.entries(before.tables))if(table!=='assetHistory')assert.deepEqual(after.tables[table],rows,'Current records changed');
  const sample=added[0];
  assert(await dbEval(`return (await m.getAssetById(${JSON.stringify(sample.assetId)})).history.some(h=>h.date===${JSON.stringify(sample.date)}&&!!h.quantitySourceDate)`),'History detail lost provenance');
  // Repeating a request must not duplicate dates or destroy the undo copy.
  await click('button','최근 3개월 시세 소급 업데이트');
  await until(()=>evaluate("document.querySelector('main').innerText.includes('새로 추가하거나 보정할 시세가 없습니다')"),'repeat produces no new rows');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,after.tables);
  await click('button','마지막 과거 시세 보정 되돌리기');
  await until(()=>evaluate("document.querySelector('main').innerText.includes('시세 보정 되돌리기 완료')"),'undo insertions and updates');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,before.tables);
  console.log('BACKFILL_UI=PASS; addedRows='+added.length+'; repeated=no-op; originals=current values preserved; undo=exact restore; prices=synthetic');
};
