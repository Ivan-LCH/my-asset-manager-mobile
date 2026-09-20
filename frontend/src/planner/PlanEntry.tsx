import type { ReactNode } from 'react';

/** Only the selected record mounts its editor; the URL owns selection and deep links. */
export default function PlanEntry({ id, title, description, open, onToggle, children }: {
    id: string; title: string; description?: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
    return <section className="panel plan-entry" id={'source-' + id}>
      <button className="secondary entry-toggle" aria-expanded={open} aria-controls={'editor-' + id} onClick={onToggle}>
        <span>{title}{description && <small>{description}</small>}</span><span>{open ? '접기' : '수정하기'}</span>
      </button>
      {open && <div id={'editor-' + id}>{children}</div>}
    </section>;
}
