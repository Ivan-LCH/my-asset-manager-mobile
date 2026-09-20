// User-authorized local backup rehearsal. Never writes to the user's normal browser profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({navigate,evaluate,dbEval,call,until,privateBackup,exceptions})=>{
  const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1]);return path.resolve(process.argv[i+1])};
  const patchPath=arg('--plan-file'),output=arg('--output-backup');
  assert.equal(path.dirname(output),path.dirname(privateBackup));assert(!fs.existsSync(output),'Never overwrite a backup');
  const before=await dbEval('return await m.exportBackup()'),payload=JSON.parse(fs.readFileSync(patchPath,'utf8'));
  await evaluate('window.confirm=message=>{window.__planConfirmation=message;return true}');
  const document=await call('DOM.getDocument'),field=await call('DOM.querySelector',{nodeId:document.root.nodeId,selector:'input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[patchPath]});
  await until(()=>evaluate("document.body.innerText.includes('연금 계획 등록 완료')"),'Plan-only file import');
  assert((await evaluate('window.__planConfirmation')).includes('현재 자산·주식·이력·생활비'));
  const after=await dbEval('return await m.exportBackup()');
  for(const [key,rows] of Object.entries(before.tables))if(!['settings','pensionDetails'].includes(key))assert.deepEqual(after.tables[key],rows,'Untouched table '+key);
  const get=(b,key)=>JSON.parse(b.tables.settings.find(s=>s.key===key).value);
  const oldRet=get(before,'retirement_plan'),newRet=get(after,'retirement_plan'),oldPlan=get(before,'pension_sim_plan'),newPlan=get(after,'pension_sim_plan');
  assert.deepEqual(newRet.expenses,oldRet.expenses);assert.deepEqual(newRet.travel,oldRet.travel);assert.equal(newRet.medicalMonthly,oldRet.medicalMonthly);
  assert.deepEqual(newPlan.incomeTaxSettings,oldPlan.incomeTaxSettings,'Unknown tax input is not fabricated');
  const {kind,...monthly}=payload;assert.deepEqual(newPlan.monthlyPlan,monthly);
  const modified=new Set(['retirement_plan','pension_sim_plan','retirementYear']);
  assert.deepEqual(after.tables.settings.filter(s=>!modified.has(s.key)),before.tables.settings.filter(s=>!modified.has(s.key)));
  const managed=new Set(payload.accounts.map(a=>a.sourceId));
  assert.deepEqual(after.tables.pensionDetails.filter(d=>!managed.has(d.assetId)),before.tables.pensionDetails.filter(d=>!managed.has(d.assetId)));
  const review=await dbEval(`
    const {pensionInputs}=await import('/src/lib/analysisInputs.ts'),{annualPension}=await import('/src/lib/annualPension.ts');
    const assets=await m.getAllAssets(),p=pensionInputs(await m.getPensionSim(),assets),r=await m.getRetirement();
    const result=annualPension(p,assets,2026,2060,{simulation:true,lumpsums:r.lumpsum,currentYear:2026,growth:10,dividend:4});
    if(result.incomplete)throw Error('Connection incomplete');
    for(const row of result.rows)if(Math.abs(row.opening+row.inflow+row.growth-row.paid-row.closing)>1)throw Error('Ledger mismatch');
    const insurance=p.monthlyPlan.accounts.find(a=>a.role==='insurance'),dc=p.monthlyPlan.accounts.find(a=>a.role==='companyDC'),irp=p.monthlyPlan.accounts.find(a=>a.role==='personalIRP');
    const paid=(y,id)=>result.rows.find(r=>r.year===y).entries.find(e=>e.id===id)?.paid??0;
    if(paid(2029,insurance.sourceId)!==1160000*9||paid(2049,insurance.sourceId)!==1160000*3||paid(2050,insurance.sourceId)!==0)throw Error('Insurance timing mismatch');
    if(result.rows.some(r=>r.entries.find(e=>e.id===dc.sourceId)?.paid>0))throw Error('Duplicate DC payment');
    if(paid(2028,irp.sourceId)!==0||paid(2029,irp.sourceId)<=0||paid(2059,irp.sourceId)<=0||paid(2060,irp.sourceId)!==0)throw Error('IRP timing mismatch');
    return {years:result.rows.length,capitalReconciled:true,insuranceMonths:[9,3],dcDuplicatePayout:false,irpPeriodMonths:360};
  `);
  for(const width of [1440,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
    await navigate('/analysis?tab=pension-sim','개인투자시뮬');
    await until(()=>evaluate("!!document.querySelector('[data-registered-pension-plan]')"),'Registered plan summary');
    await evaluate("document.querySelector('[data-registered-pension-plan]').open=true");
    assert(await evaluate("document.querySelector('[data-registered-pension-plan]').innerText.includes('2059-03')"));
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow');
  }
  // UI export and file import round-trip of the registered plan, in the isolated profile.
  await navigate('/settings','설정');
  await evaluate(`(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.__planBlob=blob;return original.call(this,blob)};HTMLAnchorElement.prototype.click=function(){if(this.download)window.__planExportName=this.download};[...document.querySelectorAll('button')].find(b=>b.textContent.includes('내보내기 (JSON)')).click()})()`);
  await until(()=>evaluate('!!window.__planExportName'),'Export button');
  const exported=JSON.parse(await evaluate('window.__planBlob.text()'));assert.deepEqual(exported.tables,after.tables);
  fs.writeFileSync(output,JSON.stringify(exported,null,2),{encoding:'utf8',flag:'wx'});
  await evaluate('window.confirm=()=>true');
  const doc2=await call('DOM.getDocument'),field2=await call('DOM.querySelector',{nodeId:doc2.root.nodeId,selector:'input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:field2.nodeId,files:[output]});
  await until(()=>evaluate("document.body.innerText.includes('가져오기 완료')"),'Exported backup file import');
  assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,exported.tables);
  assert.equal(exceptions.length,0);
  const report={result:'PASS',...review,actualFileImport:true,exportImportRoundtrip:true,desktopMobile:true,originalPreserved:true,userBrowserUpdated:false};
  fs.writeFileSync(output.replace(/\.json$/i,'.report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('PENSION_REGISTRATION='+JSON.stringify(report));
};
