import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { loadContext, type Context, type SavedRun } from './storage';
import { db } from '@/lib/db';
const PlannerContext = createContext<{
    data: Context | null;
    error: string | null;
}>({ data: null, error: null });
export function PlannerProvider({ children }: {
    children: ReactNode;
}) {
    const [data, setData] = useState<Context | null>(null), [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const sub = liveQuery(loadContext).subscribe({ next: value => { setData(value); setError(null); }, error: e => setError(String(e)) });
        return () => sub.unsubscribe();
    }, []);
    return <PlannerContext.Provider value={{ data, error }}>{children}</PlannerContext.Provider>;
}
export const usePlanner = () => useContext(PlannerContext);
export function useSavedRun(id: string | null) {
    const [record, setRecord] = useState<SavedRun | null>(null), [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setRecord(null);
        setError(null);
        if (!id)
            return;
        const sub = liveQuery(() => db.table('plannerRuns').get(id)).subscribe({ next: value => { setRecord(value ?? null); setError(value ? null : '저장된 분석이 없습니다. 새로 계산하거나 다른 결과를 선택하세요.'); }, error: e => setError(String(e)) });
        return () => sub.unsubscribe();
    }, [id]);
    return { record, error };
}
