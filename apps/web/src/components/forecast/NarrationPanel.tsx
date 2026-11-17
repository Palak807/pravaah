import { useMemo } from 'react';
import { fmt } from '@nabz/engine';
import { useStoreShallow } from '../../store';
import { narrate } from '../../narrator';
import { plural } from './helpers';

export function NarrationPanel() {
  const { base, plan, hasPlan, view, viewT } = useStoreShallow((s) => ({
    base: s.base,
    plan: s.plan,
    hasPlan: s.hasPlan,
    view: s.view,
    viewT: s.viewT,
  }));
  const cur = view === 'plan' && hasPlan ? plan : base;
  const beats = useMemo(() => narrate(cur), [cur]);
  const shown = beats.filter((b) => b.t <= viewT);
  const recent = shown.slice(-40).reverse();
  const m = cur.metrics;

  let problem: string;
  if (m.cancelCount) {
    problem = `The chain reaction: discharges are slow, so the ward stays full; intensive-care patients can't move down into a full ward, so those beds stay blocked; and ${plural(
      m.cancelCount,
      'surgery that needs',
      'surgeries that need',
    )} an intensive-care bed afterwards ${m.cancelCount === 1 ? 'gets' : 'get'} cancelled.`;
  } else if (m.boardHours > 3) {
    problem = `No surgery is cancelled, but because beds free up late, emergency patients wait a long time for a ward bed today.`;
  } else {
    problem = `Beds free up in good time today, so nothing jams.`;
  }

  return (
    <aside className="narration">
      <div className="narration-head">
        <h3>What's happening</h3>
        <span className="narration-clock">{fmt(viewT)}</span>
      </div>
      <div className={'problem ' + (m.cancelCount ? 'bad' : m.boardHours > 3 ? 'warn' : 'good')}>{problem}</div>
      <ul className="beatlist" aria-live="polite">
        {recent.length === 0 ? (
          <li className="beat empty">The morning is quiet so far. Press play to watch the day unfold — I'll explain each thing as it happens.</li>
        ) : (
          recent.map((b) => (
            <li key={b.id} className={'beat lv' + b.level + (viewT - b.t < 6 ? ' fresh' : '')}>
              <span className="bt">{fmt(b.t)}</span>
              <span className="btext">{b.text}</span>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
