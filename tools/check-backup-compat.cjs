// Read-only source file; actual import/export uses in-memory IndexedDB, never a user's browser.
// Output contains schema paths/counts only, never field values or raw exceptions.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../frontend');
const localRequire = Module.createRequire(path.join(root, 'package.json'));
const ts = localRequire('typescript');
localRequire('fake-indexeddb/auto');
const cache = new Map();
function source(file) {
  if (cache.has(file)) return cache.get(file).exports;
  if (!file.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Source boundary');
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const resolve = name => name.startsWith('@/') ? source(path.join(root, 'src', name.slice(2)) + '.ts') : name.startsWith('.') ? source(path.resolve(path.dirname(file), name) + '.ts') : localRequire(name);
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
  return module.exports;
}
function sanitized(error) {
  const message = String(error?.message ?? '');
  const row = message.match(/^([a-zA-Z]+)\[(\d+)\]:/);
  const paths = [...message.matchAll(/"path":\s*\[([^\]]*)\]/g)].map(m => m[1].replace(/[\s"]/g, ''));
  return { category: row ? 'ROW_SCHEMA' : 'IMPORT_OR_ROUNDTRIP', table: row?.[1], row: row ? Number(row[2]) : undefined, fields: paths };
}
(async () => {
  if (!process.argv[2]) throw new Error('Provide backup path');
  const input = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8').replace(/^\uFEFF/, ''));
  const m = source(path.join(root, 'src/lib/db.ts'));
  try {
    const preview = await m.previewBackup(input);
    await m.importBackup(preview.data, preview.expected);
    const output = await m.exportBackup();
    for (const [table, rows] of Object.entries(input.tables)) assert.deepEqual(output.tables[table], rows);
    await m.importBackup(output);
    assert.deepEqual((await m.exportBackup()).tables, output.tables);
    console.log(JSON.stringify({ result: 'PASS', originalTablesPreserved: true, v2RoundTrip: true, counts: Object.fromEntries(Object.entries(input.tables).map(([table, rows]) => [table, rows.length])) }));
    if (process.argv.includes('--audit')) {
      const storage = source(path.join(root, 'src/planner/storage.ts'));
      const context = await storage.loadContext();
      const linked = context.current.positions.filter(p => p.source.type === 'PENSION' && p.source.detail?.linkedStockId);
      const flows = storage.assetFlowPreview(context.plan, context.snapshot).plan.flows;
      const fundedLinkedAccounts = linked.filter(p => context.current.positions.some(s => s.source.type === 'STOCK' && s.source.detail?.accountName === p.source.detail.linkedStockId && s.balance > 0));
      console.log(JSON.stringify({ review: 'LINKED_PENSION', linkedAccountsWithStockBalance: fundedLinkedAccounts.length,
        linkedPensionRowsWithZeroBalance: fundedLinkedAccounts.filter(p => p.balance === 0).length,
        positiveWithdrawalsPointingAtZeroLinkedRow: flows.filter(f => f.kind === 'withdrawal' && f.amount > 0 && !f.withdrawalAssetIds?.length && fundedLinkedAccounts.some(p => p.assetId === f.assetId && p.balance === 0)).length,
        actualFundingLists: flows.filter(f=>f.withdrawalAssetIds?.length).length,
        linkedPolicyReferences: linked.filter(p => p.linkedTo).length }));
    }
  } catch (error) {
    console.log(JSON.stringify({ result: 'FAIL', ...sanitized(error) }));
    process.exitCode = 1;
  } finally { await m.db.delete(); }
})().catch(() => { console.error('CHECK_FAILED (details redacted)'); process.exitCode = 1; });
