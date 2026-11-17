import { useMemo } from 'react';
import { fmt } from '@nabz/engine';
import type { DeptKey } from '@nabz/engine';
import { useStoreShallow } from '../../store';
import { snapAt, nameOf } from '../../sim';
import { narrate, STATION_INFO, type Station } from '../../narrator';
import { wardVis, icuVis, edVis } from './bedVis';
import { deptLine } from './helpers';

type StId = 'theatres' | 'icu' | 'ward' | 'discharge' | 'emergency';
const DEPT_OF: Record<StId, DeptKey> = { theatres: 'th', icu: 'icu', ward: 'ward', discharge: 'dis', emergency: 'ed' };

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const ICONS: Record<StId, React.ReactNode> = {
  emergency: svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>,
  ),
  ward: svg(
    <>
      <path d="M2 4v16" />
      <path d="M2 9h16a3 3 0 0 1 3 3v8" />
      <path d="M2 16h19" />
      <path d="M6 9v-.5A2.5 2.5 0 0 1 8.5 6H10" />
    </>,
  ),
  icu: svg(<path d="M22 12h-4l-3 8-5-16-3 8H2" />),
  theatres: svg(
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </>,
  ),
  discharge: svg(
    <>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </>,
  ),
};

const CALLOUT: Record<StId, { title: string; body: string }> = {
  discharge: {
    title: 'Discharge is the hold-up',
    body: 'Patients who are fit to go home are still in their beds because the paperwork is not finished. Until they leave, no ward bed frees up.',
  },
  ward: {
    title: 'The ward is full',
    body: 'Every ward bed is taken. Emergency patients, intensive-care step-downs and planned admissions all have to wait for a bed to free up.',
  },
  icu: {
    title: 'Intensive care is blocked',
    body: 'An intensive-care patient is well enough for the ward, but the ward is full — so the bed cannot be freed for a surgery patient who will need it.',
  },
  theatres: {
    title: 'A surgery is stuck',
    body: 'A surgery needs an intensive-care bed afterwards, but none is free. It is held now, and will be cancelled if a bed does not come free in time.',
  },
  emergency: { title: 'Emergency is backing up', body: 'Emergency patients who need to be admitted cannot get a ward bed.' },
};

function Dots({ items }: { items: string[] }) {
  return (
    <div className="dots">
      {items.map((cls, i) => (
        <i key={i} className={'dot ' + cls} />
      ))}
    </div>
  );
}

export function FlowBoard() {
  const { base, plan, hasPlan, view, viewT, now, guided, playing, play, setFocusStation } = useStoreShallow((s) => ({
    base: s.base,
    plan: s.plan,
    hasPlan: s.hasPlan,
    view: s.view,
    viewT: s.viewT,
    now: s.now,
    guided: s.guided,
    playing: s.playing,
    play: s.play,
    setFocusStation: s.setFocusStation,
  }));
  const cur = view === 'plan' && hasPlan ? plan : base;
  const s = snapAt(cur, viewT);
  const beats = useMemo(() => narrate(cur), [cur]);

  // active patient movements right now, bucketed by lane
  const flows = { ti: 0, iw: 0, wd: 0, feeder: 0 };
  beats.forEach((b) => {
    if (!b.from || b.t > viewT || viewT - b.t >= 6) return;
    if (b.to === 'discharge') flows.wd++;
    else if (b.from === 'icu' && b.to === 'ward') flows.iw++;
    else if (b.from === 'theatres') flows.ti++;
    else if (b.from === 'emergency') flows.feeder++;
  });

  // bottleneck = most-upstream jammed area
  const order: StId[] = ['discharge', 'ward', 'icu', 'theatres', 'emergency'];
  const bottleneck = order.find((id) => s.lv[DEPT_OF[id]] === 2) ?? null;

  const fit = cur.dis.length;
  const wardTotal = cur.config.wardBeds;
  const icuTotal = cur.config.icuBeds;

  // theatre case summary
  let thDone = 0,
    thRun = 0,
    thHeld = 0,
    thCancel = 0,
    thWait = 0;
  s.th.forEach((l) =>
    l.forEach((c) => {
      if (c.status === 'done') thDone++;
      else if (c.status === 'running') thRun++;
      else if (c.status === 'held') thHeld++;
      else if (c.status === 'cancelled') thCancel++;
      else thWait++;
    }),
  );
  const thTotal = thDone + thRun + thHeld + thCancel + thWait;

  const card = (id: StId, big: string, sub: string, fillPct: number, viz: React.ReactNode, col: number) => {
    const info = STATION_INFO[id as Exclude<Station, 'home'>];
    const lv = s.lv[DEPT_OF[id]];
    return (
      <button
        className={'station l' + lv + (bottleneck === id ? ' bottleneck' : '')}
        style={{ gridColumn: col, gridRow: 1 }}
        onClick={() => setFocusStation(id)}
        aria-label={`${info.title}. ${big}. ${sub}. Click to see beds.`}
      >
        <div className="st-head">
          <span className={'st-ico st-ico-' + id}>{ICONS[id]}</span>
          <b>{info.title}</b>
          {bottleneck === id && <span className="st-jam">Bottleneck</span>}
        </div>
        <p className="st-blurb">{info.blurb}</p>
        <div className="st-big">{big}</div>
        <div className="st-sub">{sub}</div>
        <div className="st-bar">
          <span style={{ width: Math.max(0, Math.min(100, fillPct)) + '%' }} className={'st-fill l' + lv} />
        </div>
        {viz}
      </button>
    );
  };

  const Lane = ({ cls, col, active, label }: { cls: string; col: number; active: number; label: string }) => (
    <div className={'lane ' + cls} style={{ gridColumn: col, gridRow: 1 }}>
      <span className="lane-label">{label}</span>
      {active > 0 &&
        Array.from({ length: Math.min(active, 3) }).map((_, i) => <span key={i} className="token" style={{ animationDelay: i * 0.3 + 's' }} />)}
    </div>
  );

  const legend: [string, string][] = [
    ['b-occ', 'Occupied'],
    ['b-ready', 'Fit to go home'],
    ['b-new', 'Arrived today'],
    ['b-jam', 'Stuck / waiting'],
    ['b-dirty', 'To clean'],
    ['b-free', 'Free'],
  ];

  return (
    <div className="flowboard">
      <div className="flow-head">
        <span className="flow-title">The floor, right now</span>
        <div className="legend-inline">
          {legend.map(([cls, label]) => (
            <span key={cls}>
              <i className={'dot ' + cls} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="flowgrid">
        {card(
          'theatres',
          thDone + '/' + thTotal + ' done',
          thCancel ? thCancel + ' cancelled' : thHeld ? thHeld + ' held' : thRun ? thRun + ' in theatre' : 'running to plan',
          (thDone / Math.max(1, thTotal)) * 100,
          <div className="chips">
            {s.th.flat().map((c) => (
              <span key={c.id} className={'chip-sm ' + c.status} title={c.name + ' — ' + c.status}>
                {c.name.split(' ')[0]}
              </span>
            ))}
          </div>,
          1,
        )}
        <Lane cls="h" col={2} active={flows.ti} label="post-op →" />
        {card(
          'icu',
          s.n.icuFree + ' free',
          s.n.sd ? s.n.sd + ' stuck, ready for ward' : icuTotal - s.n.icuFree + '/' + icuTotal + ' in use',
          ((icuTotal - s.n.icuFree) / icuTotal) * 100,
          <Dots items={s.icu.map((b) => icuVis(b).cls)} />,
          3,
        )}
        <Lane cls="h" col={4} active={flows.iw} label="moves to ward →" />
        {card(
          'ward',
          s.n.free + ' free',
          s.n.board + s.n.sd + s.n.plan ? s.n.board + s.n.sd + s.n.plan + ' waiting for a bed' : wardTotal - s.n.free + '/' + wardTotal + ' beds full',
          ((wardTotal - s.n.free) / wardTotal) * 100,
          <Dots items={s.ward.map((b) => wardVis(b).cls)} />,
          5,
        )}
        <Lane cls="h" col={6} active={flows.wd} label="goes home →" />
        {card(
          'discharge',
          s.gone + '/' + fit + ' left',
          s.n.stillInBed + ' still in bed',
          (s.gone / Math.max(1, fit)) * 100,
          <div className="st-note">{deptLine('dis', s)}</div>,
          7,
        )}

        {/* feeder: emergency -> ward */}
        <div className="lane v" style={{ gridColumn: 5, gridRow: 2 }}>
          <span className="lane-label">↑ admitted</span>
          {flows.feeder > 0 && Array.from({ length: Math.min(flows.feeder, 3) }).map((_, i) => <span key={i} className="token up" style={{ animationDelay: i * 0.3 + 's' }} />)}
        </div>
        <div style={{ gridColumn: 5, gridRow: 3 }}>
          {card('emergency', s.n.board + ' waiting', s.n.busyBays + '/' + s.ed.length + ' bays in use', (s.n.busyBays / s.ed.length) * 100, <Dots items={s.ed.map((p) => edVis(p).cls)} />, 5)}
        </div>
      </div>

      {guided && !playing && viewT > now && bottleneck && (
        <div className="callout">
          <div className={'callout-box l' + s.lv[DEPT_OF[bottleneck]]}>
            <b>
              {fmt(viewT)} — {CALLOUT[bottleneck].title}
            </b>
            <p>{CALLOUT[bottleneck].body}</p>
            <p className="callout-now">Right now: {deptLine(DEPT_OF[bottleneck], s)}.</p>
            <button className="btn small primary" onClick={play}>
              Keep playing →
            </button>
          </div>
        </div>
      )}

      <BedPopover />
    </div>
  );
}

function BedPopover() {
  const { base, plan, hasPlan, view, viewT, focusStation, setFocusStation } = useStoreShallow((s) => ({
    base: s.base,
    plan: s.plan,
    hasPlan: s.hasPlan,
    view: s.view,
    viewT: s.viewT,
    focusStation: s.focusStation,
    setFocusStation: s.setFocusStation,
  }));
  if (!focusStation) return null;
  const cur = view === 'plan' && hasPlan ? plan : base;
  const s = snapAt(cur, viewT);
  const id = focusStation as StId;
  const info = STATION_INFO[id as Exclude<Station, 'home'>];

  let body: React.ReactNode = null;
  if (id === 'ward') {
    body = (
      <div className="bedgrid ward">
        {s.ward.map((b) => {
          const v = wardVis(b);
          return (
            <div key={b.n} className={'bed ' + v.cls} title={nameOf(b.pid) || v.word}>
              <i>{b.n}</i>
              <em>{v.word}</em>
            </div>
          );
        })}
      </div>
    );
  } else if (id === 'icu') {
    body = (
      <div className="bedgrid">
        {s.icu.map((b) => {
          const v = icuVis(b);
          return (
            <div key={b.n} className={'bed ' + v.cls} title={nameOf(b.pid) || v.word}>
              <i>{b.n}</i>
              <em>{v.word}</em>
            </div>
          );
        })}
      </div>
    );
  } else if (id === 'emergency') {
    body = (
      <div className="bedgrid">
        {s.ed.map((p, i) => {
          const v = edVis(p);
          return (
            <div key={i} className={'bed ' + v.cls} title={v.word}>
              <i>{i + 1}</i>
              <em>{v.word}</em>
            </div>
          );
        })}
      </div>
    );
  } else if (id === 'theatres') {
    body = (
      <div className="caselist">
        {s.th.flat().map((c) => (
          <div key={c.id} className={'case ' + c.status}>
            <b>{c.name}</b>
            {c.status === 'waiting'
              ? fmt(c.planned) + ' planned'
              : c.status === 'running'
                ? 'in theatre since ' + fmt(c.startT)
                : c.status === 'done'
                  ? 'done ' + fmt(c.endT)
                  : c.status === 'held'
                    ? 'held ' + c.hold + ' min, no ICU bed'
                    : 'cancelled ' + fmt(c.cancelT)}
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="caselist">
        {cur.dis.map((d) => (
          <div key={d.id} className="case">
            <b>
              Bed {d.bed}, {nameOf(d.id)}
            </b>
            {d.insured ? 'insured' : 'paying cash'} — {d.tBedFree != null ? 'bed free ' + fmt(d.tBedFree) : 'not free before 21:00'}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="popover-backdrop" onClick={() => setFocusStation(null)}>
      <div className="popover" onClick={(e) => e.stopPropagation()}>
        <div className="popover-head">
          <h3>
            {info.title} — {fmt(viewT)}
          </h3>
          <button className="btn small" onClick={() => setFocusStation(null)}>
            Close
          </button>
        </div>
        <p className="st-blurb">{info.blurb}</p>
        {body}
      </div>
    </div>
  );
}
