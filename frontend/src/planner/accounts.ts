import type { Asset, StockDetail } from '@/types';
import type { AssetPolicy, Position } from './model';

export const accountName = (asset: Asset) => (asset.detail as StockDetail | undefined)?.accountName?.trim() || '미분류';
/** An existing member asset ID anchors navigation. Renaming an account does not change that ID.
 * Old links resolve by the member, not a hash of a mutable account name. No extra money row is created. */
export function stockAccounts(assets: Asset[]) {
    const groups = new Map<string, Asset[]>();
    for (const asset of assets.filter(a => a.type === 'STOCK' && !a.disposalDate)) {
        const name = accountName(asset);
        groups.set(name, [...(groups.get(name) ?? []), asset]);
    }
    return [...groups].map(([name, members]) => {
        const assets = [...members].sort((a, b) => a.id.localeCompare(b.id));
        return { id: assets[0].id, name, assets };
    });
}
export const stockAccountUrl = (id: string) => '/assets?type=STOCK&account=' + encodeURIComponent(id);
export function accountFundingIds(group: ReturnType<typeof stockAccounts>[number], positions: Position[], policies: AssetPolicy[] = []) {
    return group.assets.filter(a=>{
        const p=policies.find(p=>p.assetId===a.id)??positions.find(p=>p.assetId===a.id);
        return p&&!p.linkedTo&&['investment','pension','deposit'].includes(p.role);
    }).map(a=>a.id);
}
export function safeAssetReturn(value: string | null, fallback = '/assets?type=ALL') {
    if (!value || !value.startsWith('/assets?')) return fallback;
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && url.pathname === '/assets' ? url.pathname + url.search : fallback;
}
