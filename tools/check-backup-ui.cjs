// Synthetic fixtures only, in the runner's isolated Chrome profile.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
module.exports=async({navigate,evaluate,dbEval,call,until,snapshot})=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'myasset-backup-fixture-'));
  const fixturePath=path.join(folder,'synthetic-bom.json');
  try{
    const before=(await dbEval('return await m.exportBackup()')).tables;
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("!!document.querySelector('[data-financial-tax-total]')"),'Tax before UI roundtrip');
    const taxBefore=await evaluate("document.querySelector('[data-financial-tax-total]').dataset.financialTaxTotal");
    await navigate('/settings','설정');
    // Capture the actual download payload without invoking the system download UI.
    await evaluate(`(()=>{
      const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.__backupBlob=blob;return original.call(this,blob)};
      const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__backupName=this.download;return}return click.call(this)};
      [...document.querySelectorAll('button')].find(b=>b.textContent.includes('내보내기 (JSON)')).click();
    })()`);
    await until(()=>evaluate('!!window.__backupName'),'Download generated');
    const exported=JSON.parse(await evaluate('window.__backupBlob.text()'));
    assert.deepEqual(exported.tables,before,'Actual export button preserves complete settings');
    assert.match(await evaluate('window.__backupName'),/^asset-manager-backup-\d{4}-\d{2}-\d{2}T.*\.json$/);
    fs.writeFileSync(fixturePath,'\uFEFF'+JSON.stringify(exported),'utf8');
    // Create a local edit so the import confirmation must warn about its removal.
    await dbEval("const p=await m.getPensionSim();await m.savePensionSim({...p,incomeTaxSettings:{...p.incomeTaxSettings,years:{...p.incomeTaxSettings.years,2099:{husband:{domesticWithholding:0}}}}})");
    await evaluate('window.confirm=message=>{window.__importConfirmation=message;return true}');
    const doc=await call('DOM.getDocument');
    const input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fixturePath]});
    await until(()=>dbEval("return (await m.getLastBackupImport())?.sourceName==='synthetic-bom.json'"),'Actual file input import');
    const confirmation=await evaluate('window.__importConfirmation');
    assert(confirmation.includes('IRP·세금 설정')&&confirmation.includes('백업 생성 시각')&&confirmation.includes('IRP 합산 1건'),'Import shows date, settings and loss warning');
    assert.deepEqual((await dbEval('return await m.exportBackup()')).tables,before,'Actual file import preserves IRP/tax fields');
    for(const width of [1440,390]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
      await navigate('/settings','설정');
      await until(()=>evaluate("!!document.querySelector('[data-last-backup-import]')"),'Receipt persists after reload');
      await evaluate("const d=document.querySelector('[data-last-backup-import]');d.open=true;d.scrollIntoView({block:'center'})");
      const receipt=await evaluate("document.querySelector('[data-last-backup-import]').innerText");
      assert(receipt.includes('synthetic-bom.json')&&receipt.includes(exported.exportedAt));
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Receipt fits viewport');
      await snapshot('backup-receipt-'+width);
    }
    await navigate('/analysis','내 은퇴 분석');
    await until(()=>evaluate("!!document.querySelector('[data-financial-tax-total]')"),'Tax after UI roundtrip');
    assert.equal(await evaluate("document.querySelector('[data-financial-tax-total]').dataset.financialTaxTotal"),taxBefore,'Analysis result remains identical after UI export/import');
    console.log('BACKUP_UI=PASS; actual export/file-input import; BOM; loss warning; persistent receipt; desktop/mobile; analysis unchanged');
  }finally{
    // Only this helper's exact synthetic file and empty temporary directory.
    if(fs.existsSync(fixturePath))fs.unlinkSync(fixturePath);
    fs.rmdirSync(folder);
  }
};
