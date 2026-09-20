// Explicit private-backup maintenance, never a fixture. No personal IDs/data in source.
// Run through check-local-app.cjs --apply-irp-update --backup FILE with the arguments below.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,privateBackup,exceptions})=>{
  const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],'Missing '+name);return process.argv[i+1]};
  const output=path.resolve(arg('--output-backup')),sourceId=arg('--source-id'),targetId=arg('--target-id'),lumpId=arg('--lump-id');
  const parent=path.dirname(privateBackup);
  assert.equal(path.dirname(output),parent,'Output stays beside the user-supplied backup, outside the repository');
  assert.notEqual(output,privateBackup);assert(!fs.existsSync(output),'Refusing to overwrite an existing output');
  const before=await dbEval('return await m.exportBackup()');
  const planRow=before.tables.settings.find(r=>r.key==='pension_sim_plan'),retirementRow=before.tables.settings.find(r=>r.key==='retirement_plan');
  assert(planRow&&retirementRow,'Missing existing pension/retirement plan');
  const plan=JSON.parse(planRow.value),retirement=JSON.parse(retirementRow.value);
  const lump=retirement.lumpsum?.find(l=>l.id===lumpId);
  assert(lump&&lump.taxKind==='severance'&&lump.amount>0&&Number.isInteger(lump.receiveYear));
  assert(lump.receiveYear>=new Date().getFullYear()&&lump.receiveYear<=2200);
  assert(retirement.linkPensionSim===true,'Do not silently enable a different analysis mode');
  const allocation=plan.allocations?.find(a=>a.lumpsumId===lumpId);
  assert(allocation&&allocation.irpAmount>0&&allocation.irpAmount<=lump.amount);
  const source=before.tables.assets.find(a=>a.id===sourceId),target=before.tables.assets.find(a=>a.id===targetId);
  assert(source&&target&&source.id!==target.id&&!source.disposalDate&&!target.disposalDate);
  assert(source.ownership&&target.ownership&&JSON.stringify(source.ownership)===JSON.stringify(target.ownership));
  assert(source.ownership.husband===100&&source.ownership.wife===0,'Only the confirmed same-owner pair');
  const details=before.tables.pensionDetails;
  const sd=details.find(d=>d.assetId===sourceId),td=details.find(d=>d.assetId===targetId);
  assert(sd?.linkedStockId&&td?.linkedStockId&&sd.linkedStockId!==td.linkedStockId,'Separate linked stock accounts required');
  const next=structuredClone(plan);
  assert(!next.irpTransfers?.some(t=>t.sourceId===targetId||t.targetId===sourceId),'Existing transfer chain requires review');
  next.allocations=next.allocations.map(a=>a.lumpsumId===lumpId?{...a,irpSourceId:sourceId}:a);
  next.irpTransfers=[...(next.irpTransfers??[]).filter(t=>t.sourceId!==sourceId),{sourceId,targetId,year:lump.receiveYear}];
  // All tax flags, principal splits and rates remain exactly as supplied by the user.
  assert.deepEqual(next.incomeTaxSettings,plan.incomeTaxSettings);
  const validity=await dbEval(`const {pensionInputs}=await import('/src/lib/analysisInputs.ts');const p=pensionInputs(${JSON.stringify(next)},await m.getAllAssets());return [${JSON.stringify(sourceId)},${JSON.stringify(targetId)}].every(id=>p.sources.some(s=>s.id===id&&s.taxType==='irp'));`);
  assert(validity,'Both existing sources must be explicitly classified as IRP');
  await dbEval(`await m.savePensionSim(${JSON.stringify(next)});return true;`);
  const review=await dbEval(`
    const {pensionInputs}=await import('/src/lib/analysisInputs.ts');const {annualPension}=await import('/src/lib/annualPension.ts');
    const assets=await m.getAllAssets(),p=pensionInputs(await m.getPensionSim(),assets),r=await m.getRetirement(),portfolio=await m.getPortfolio();
    const result=annualPension(p,assets,new Date().getFullYear(),${lump.receiveYear},{simulation:true,lumpsums:r.lumpsum,growth:portfolio?.growthRate??0,dividend:portfolio?.dividendYield??0});
    const row=result.rows.find(r=>r.year===${lump.receiveYear});if(!row||result.incomplete)throw Error('Incomplete IRP transfer');
    const origin=row.entries.find(e=>e.id===${JSON.stringify(sourceId)}),dest=row.entries.find(e=>e.id===${JSON.stringify(targetId)});
    if(!origin||!dest||origin.paid!==0||dest.paid<=0)throw Error('Transfer did not stop duplicate payout');
    for(const r of result.rows)if(Math.abs(r.opening+r.inflow+r.growth-r.paid-r.closing)>1)throw Error('Capital reconciliation');
    return {year:row.year,sourcePaid:origin.paid,targetPaid:dest.paid,unknownFunding:dest.funding?.unknown??0,externalInflow:row.inflow};
  `);
  console.log('IRP_CONNECTION_VERIFIED year='+review.year+'; source payout stopped; no duplicate capital; tax assumptions unchanged');
  // Real quotes through the existing same-origin provider proxy, never synthetic prices.
  await evaluate(`window.__privatePriceJob={stage:'running',done:0,total:0};(async()=>{try{const m=await import('/src/lib/db.ts');window.__privatePricePreview=await m.previewStockPriceCorrection(3,(done,total)=>{window.__privatePriceJob={stage:'running',done,total}});window.__privatePriceJob.stage='ready'}catch(e){window.__privatePriceJob={stage:'error',message:'Price preview failed'}}})();true`);
  const deadline=Date.now()+15*60*1000;let lastProgress='';
  while(true){
    const progress=await evaluate('window.__privatePriceJob');
    assert(progress.stage!=='error','Price preview failed');
    if(progress.stage==='ready')break;
    assert(Date.now()<deadline,'Price preview deadline exceeded');
    const display=progress.done+'/'+progress.total;
    if(display!==lastProgress){console.log('REAL_PRICE_PROGRESS='+display);lastProgress=display}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  const summary=await evaluate(`(()=>{const p=window.__privatePricePreview;return {from:p.from,toExclusive:p.to,assets:p.assets,added:p.additions?.length??0,corrected:p.changes.length,unchanged:p.unchanged??0,missingQuantity:p.missingQuantity??0,excluded:p.excluded??0,failed:p.failed.length}})()`);
  const allowed=await evaluate('({changed:window.__privatePricePreview.changes.map(c=>c.after),added:window.__privatePricePreview.additions??[]})');
  await dbEval('await m.applyStockPriceCorrection(window.__privatePricePreview);return true');
  const after=await dbEval('return await m.exportBackup()');
  for(const [table,rows]of Object.entries(before.tables)){
    if(table==='assetHistory'||table==='settings')continue;
    assert.deepEqual(after.tables[table],rows,'Unexpected change in '+table);
  }
  assert.deepEqual(after.tables.settings.filter(s=>s.key!=='pension_sim_plan'),before.tables.settings.filter(s=>s.key!=='pension_sim_plan'));
  assert.deepEqual(JSON.parse(after.tables.settings.find(s=>s.key==='pension_sim_plan').value),next);
  const oldHistory=new Map(before.tables.assetHistory.map(r=>[r.id,r]));
  const changes=new Map(allowed.changed.map(r=>[r.id,r]));const additions=new Map(allowed.added.map(r=>[r.assetId+':'+r.date,r]));
  assert.equal(after.tables.assetHistory.length,before.tables.assetHistory.length+summary.added);
  for(const row of after.tables.assetHistory){
    if(oldHistory.has(row.id))assert.deepEqual(row,changes.get(row.id)??oldHistory.get(row.id));
    else {const {id,...value}=row;assert.deepEqual(value,additions.get(row.assetId+':'+row.date));assert(row.quantitySourceDate&&row.quantitySourceDate<row.date)}
  }
  await navigate('/analysis?tab=pension-sim#income-tax-settings','개인투자시뮬');
  assert.equal(exceptions.length,0,'Browser exception during maintenance');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,after.tables,'Viewing must not change saved inputs');
  // A validated new artifact; never replace the original or the user's current browser data.
  fs.writeFileSync(output,JSON.stringify(after,null,2),{encoding:'utf8',flag:'wx'});
  const report={input:path.basename(privateBackup),output:path.basename(output),completedAt:new Date().toISOString(),prices:summary,irp:review,originalPreserved:true,currentAssetValuesPreserved:true,userBrowserUpdated:false};
  fs.writeFileSync(output.replace(/\.json$/i,'.report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('REAL_PRICE_RESULT='+JSON.stringify(summary));
  console.log('UPDATED_BACKUP='+output);
};
