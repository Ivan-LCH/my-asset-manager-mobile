// planner 화면 공용 레이아웃·입력 컴포넌트 (pages.tsx·TotalsPolicyPage·보관 PlanPage가 함께 사용)
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePlanner } from './context';
import './planner.css';
export const textError = (e: unknown) => e instanceof Error ? e.message : String(e);
export function Shell({ title, children, subtitle, action }: {
    title: string;
    children: ReactNode;
    subtitle?: string;
    /** 헤더 오른쪽 버튼. 기본은 설정·백업 링크 */
    action?: ReactNode;
}) {
    return <div className="planner"><header className="planner-heading"><div><p className="eyebrow">MY ASSET · 현재와 미래</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action ?? <Link className="button secondary" to="/settings">설정·백업</Link>}</header>{children}</div>;
}
export function Field({ label, children }: {
    label: string;
    children: ReactNode;
}) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Num({ label, value, onChange }: {
    label: string;
    value: number | null | undefined;
    onChange: (v: number | null) => void;
}) { return <Field label={label}><input type="number" step="any" value={value ?? ''} placeholder="미입력" onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}/></Field>; }
export function Txt({ label, value, onChange, type = 'text' }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
}) { return <Field label={label}><input type={type} value={value} onChange={e => onChange(e.target.value)}/></Field>; }
export function Pick({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: Record<string, string>;
    onChange: (v: string) => void;
}) { return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(options).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
export function Check({ label, value, onChange }: {
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) { return <label className="check"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}/>{label}</label>; }
export function Loading() { const { error } = usePlanner(); return <p role={error ? 'alert' : 'status'}>{error || '저장된 자산을 읽고 있습니다…'}</p>; }
