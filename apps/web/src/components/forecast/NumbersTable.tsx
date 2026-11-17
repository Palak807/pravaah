import { fmt } from '@nabz/engine';
import { useStoreShallow } from '../../store';
import { hrs } from './helpers';

function diffWord(a: number, b: number, unit?: string): string {
  const d = Math.round((b - a) * 10) / 10;
  if (Math.abs(d) < 0.05) return 'no change';
  return (d < 0 ? 'down ' : 'up ') + Math.abs(d) + (unit || '');
}

export function NumbersTable() {
  const { base, plan, hasPlan } = useStoreShallow((s) => ({ base: s.base, plan: s.plan, hasPlan: s.hasPlan }));
  const b = base.metrics;
  const p = plan.metrics;

  const Row = ({ label, bv, pv, dw }: { label: string; bv: string | number; pv: string | number; dw: string }) => (
    <tr>
      <td>{label}</td>
      <td>
        <span className="num">{bv}</span>
      </td>
      <td className="p">
        {hasPlan ? (
          <>
            <span className="num">{pv}</span>
            <small>{dw}</small>
          </>
        ) : (
          <small>Test a plan to compare</small>
        )}
      </td>
    </tr>
  );

  const early = Math.round((b.avgBedFree ?? 0) - (p.avgBedFree ?? 0));
  const earlyWord =
    Math.abs(early) < 5 ? 'no change' : Math.floor(Math.abs(early) / 60) + ' h ' + (Math.abs(early) % 60) + ' min ' + (early > 0 ? 'earlier' : 'later');

  return (
    <table className="numbers" id="numbers">
      <thead>
        <tr>
          <th>By 21:00 tonight</th>
          <th>As things stand</th>
          <th>With plan</th>
        </tr>
      </thead>
      <tbody>
        <Row label="Surgeries cancelled" bv={b.cancelCount} pv={p.cancelCount} dw={diffWord(b.cancelCount, p.cancelCount)} />
        <Row label="Hours emergency patients wait for a ward bed" bv={hrs(b.boardHours)} pv={hrs(p.boardHours)} dw={diffWord(b.boardHours, p.boardHours)} />
        <Row label="Hours ICU patients are stuck waiting for a ward bed" bv={hrs(b.blockedHours)} pv={hrs(p.blockedHours)} dw={diffWord(b.blockedHours, p.blockedHours)} />
        <Row label="Average time a bed comes free" bv={fmt(b.avgBedFree)} pv={fmt(p.avgBedFree)} dw={earlyWord} />
        <Row label="Planned admissions put off to tomorrow" bv={b.putOff} pv={p.putOff} dw={diffWord(b.putOff, p.putOff)} />
      </tbody>
    </table>
  );
}
