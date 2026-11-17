import { fmt, FIXES, type FixId } from '@nabz/engine';
import { useStoreShallow } from '../../store';
import { nameOf, docOf } from '../../sim';
import { L, FIX_WORDS, OWNER_HI } from '../../i18n';
import { hrs } from '../forecast/helpers';

const STEP_KEYS = ['order', 'summary', 'bill', 'approval'] as const;

export function DischargeListScreen() {
  const { base, plan, done, fixes, listLang, setListLang, tick, go } = useStoreShallow((s) => ({
    base: s.base,
    plan: s.plan,
    done: s.done,
    fixes: s.fixes,
    listLang: s.listLang,
    setListLang: s.setListLang,
    tick: s.tick,
    go: s.go,
  }));
  const t = L[listLang];
  const b = base.metrics;
  const m = plan.metrics;

  // order discharges by when their bed comes free
  const ps = plan.dis.slice().sort((a, x) => {
    const av = a.tBedFree == null ? 9999 : a.tBedFree;
    const xv = x.tBedFree == null ? 9999 : x.tBedFree;
    return av - xv || parseInt(a.id.slice(1), 10) - parseInt(x.id.slice(1), 10);
  });
  const icuCases: string[] = [];
  base.cases.forEach((l) => l.forEach((c) => c.icu && icuCases.push(c.name)));
  const planDis: Record<string, (typeof plan.dis)[number]> = {};
  plan.dis.forEach((d) => (planDis[d.id] = d));

  const pend: Record<string, number> = {};

  const cards = ps.map((p, i) => {
    const need = base.demand[i] || null;
    const d = done[p.id] || {};
    const keys = STEP_KEYS.filter((k) => k !== 'approval' || p.insured);
    const clear = keys.every((k) => d[k]);
    const needText = !need
      ? t.none
      : need.kind === 'sd'
        ? t.sd(fmt(need.t), icuCases[(need.n ?? 1) - 1] || 'surgery')
        : need.kind === 'ed'
          ? t.ed(fmt(need.t))
          : t.plan(fmt(need.t));
    const pf = planDis[p.id].tBedFree;
    const when = pf == null ? t.never : t.free(fmt(pf)) + (need ? (pf > need.t + 15 ? t.late(Math.round(pf - need.t)) : t.ok) : '');

    const ticks = keys.map((k) => {
      const owner = k === 'order' ? docOf(p.id) : k === 'summary' ? t.duty : k === 'bill' ? t.billing : t.insdesk;
      if (!d[k]) pend[owner] = (pend[owner] || 0) + 1;
      return (
        <label className={'tick' + (d[k] ? ' on' : '')} key={k}>
          <input type="checkbox" checked={!!d[k]} onChange={(e) => tick(p.id, k, e.target.checked)} />
          <span>
            <b>{t[k]}</b>
            {owner}
          </span>
        </label>
      );
    });

    return (
      <div className={'card' + (clear ? ' clear' : '')} key={p.id}>
        <div className="num rank">{i + 1}</div>
        <h3>
          {t.bed} {p.bed}, {nameOf(p.id)}
          <small>{p.insured ? t.insured : t.cash}</small>
        </h3>
        <div className="need">
          {needText} {when}
        </div>
        <div className="ticks">{ticks}</div>
      </div>
    );
  });

  const fixIds = Object.keys(fixes) as FixId[];
  const actions =
    fixIds.length > 0 ? (
      <div className="actions">
        <h3>{t.actions}</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {FIXES.filter((x) => fixes[x.id]).map((x) => (
            <li key={x.id}>
              <b>{listLang === 'hi' ? FIX_WORDS[x.id].hi : x.name}</b>: {listLang === 'hi' ? OWNER_HI[x.owner] : x.owner}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const Row = ({ label, bv, pv, better }: { label: string; bv: string | number; pv: string | number; better: number }) => (
    <div className="row">
      <span>{label}</span>
      <span>
        <span className={'num ' + (better > 0 ? 'good' : better < 0 ? 'bad' : '')}>{pv}</span>
        <span className="was">
          {t.was}
          {bv}
        </span>
      </span>
    </div>
  );

  const owners = Object.keys(pend).sort((x, y) => pend[y] - pend[x]);

  return (
    <div className="dl">
      <section>
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
        <div className="dlbar">
          <div className="seg" role="group" aria-label="Language">
            <button aria-pressed={listLang === 'en'} onClick={() => setListLang('en')}>
              English
            </button>
            <button aria-pressed={listLang === 'hi'} onClick={() => setListLang('hi')}>
              हिंदी
            </button>
          </div>
          <button className="btn small" onClick={() => window.print()}>
            {t.print}
          </button>
        </div>
        {actions}
        {cards}
      </section>
      <aside className="effect">
        <h3>{t.effect}</h3>
        <Row label={t.m1} bv={b.cancelCount} pv={m.cancelCount} better={b.cancelCount - m.cancelCount} />
        <Row label={t.m2} bv={hrs(b.boardHours)} pv={hrs(m.boardHours)} better={b.boardHours - m.boardHours} />
        <Row label={t.m3} bv={fmt(b.avgBedFree)} pv={fmt(m.avgBedFree)} better={(b.avgBedFree ?? 0) - (m.avgBedFree ?? 0)} />
        <Row label={t.m4} bv={b.putOff} pv={m.putOff} better={b.putOff - m.putOff} />
        <h3 style={{ marginTop: 16 }}>{t.waiting}</h3>
        <ul className="owners">
          {owners.length > 0 ? (
            owners.map((o) => (
              <li key={o}>
                <span>{o}</span>
                <b>{pend[o]}</b>
              </li>
            ))
          ) : (
            <li>{t.nothing}</li>
          )}
        </ul>
        <p style={{ margin: '14px 0 0' }}>
          <button className="btn small" onClick={() => go(3)}>
            Back to the floor
          </button>
        </p>
      </aside>
    </div>
  );
}
