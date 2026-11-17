/* The narrator turns a simulation result into a plain-language, cause-and-effect
   story: a timestamped stream of "beats", each optionally describing a patient
   movement between areas. Derived purely from the result (snapshots + cases), so
   the engine — and its golden parity tests — stay untouched. */

import type { SimulationResult } from '@nabz/engine';
import { nameOf } from './sim';

export type Station = 'emergency' | 'ward' | 'icu' | 'theatres' | 'discharge' | 'home';

export interface Beat {
  id: string;
  t: number;
  level: 0 | 1 | 2;
  text: string;
  /** optional patient movement, drives the flow animation */
  from?: Station;
  to?: Station;
}

function srcOf(pid: string | null): Station {
  if (!pid) return 'ward';
  const c = pid[0];
  if (c === 'I') return 'icu';
  if (c === 'P') return 'emergency'; // planned admissions enter from outside; drawn via the feeder lane
  if (c === 'E' || c === 'X') return 'emergency';
  return 'ward';
}

export function narrate(r: SimulationResult): Beat[] {
  const beats: Beat[] = [];
  const snaps = r.snaps;
  const push = (t: number, level: 0 | 1 | 2, text: string, extra?: { from?: Station; to?: Station }, tag = '') =>
    beats.push({ id: `${t}-${tag}-${beats.length}`, t, level, text, ...extra });

  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const cur = snaps[i];
    const t = cur.t;

    // --- patients leaving the ward for home (a bed frees up) ---
    const leftNames: string[] = [];
    for (let j = 0; j < cur.ward.length; j++) {
      const pb = prev.ward[j];
      const cb = cur.ward[j];
      if (pb.st === 'occ' && pb.kind === 'ready' && cb.st === 'dirty') leftNames.push(nameOf(pb.pid));
    }
    if (leftNames.length) {
      const who = leftNames.length === 1 ? leftNames[0] : `${leftNames.length} patients`;
      push(
        t,
        0,
        `${who} ${leftNames.length === 1 ? 'is' : 'are'} well enough to go home and ${leftNames.length === 1 ? 'has' : 'have'} left the ward. That bed will be cleaned and reused.`,
        { from: 'ward', to: 'discharge' },
        'home',
      );
    }

    // --- new admissions into the ward (a bed fills), with the source ---
    for (let j = 0; j < cur.ward.length; j++) {
      const pb = prev.ward[j];
      const cb = cur.ward[j];
      if (cb.kind === 'new' && pb.kind !== 'new') {
        const src = srcOf(cb.pid);
        if (src === 'icu') {
          push(t, 0, `An intensive-care patient was well enough to move down, and has taken a ward bed. That frees an intensive-care bed.`, { from: 'icu', to: 'ward' }, 'adm');
        } else if (cb.pid && cb.pid[0] === 'P') {
          push(t, 0, `A planned admission has arrived and taken a ward bed.`, { from: 'emergency', to: 'ward' }, 'adm');
        } else {
          push(t, 0, `An emergency patient has finally got a ward bed and left the emergency area.`, { from: 'emergency', to: 'ward' }, 'adm');
        }
      }
    }

    // --- an intensive-care patient becomes stuck (ready for ward, no bed) ---
    for (let j = 0; j < cur.icu.length; j++) {
      if (prev.icu[j].blocked == null && cur.icu[j].blocked != null) {
        push(
          t,
          1,
          `An intensive-care patient is well enough for the ward, but every ward bed is full — so they are stuck in intensive care, and that bed cannot be used for a surgery patient.`,
          {},
          'icustuck',
        );
      }
    }

    // --- theatre case transitions ---
    for (let ti = 0; ti < cur.th.length; ti++) {
      for (let ci = 0; ci < cur.th[ti].length; ci++) {
        const pc = prev.th[ti][ci];
        const cc = cur.th[ti][ci];
        if (pc.status === cc.status) continue;
        if (cc.status === 'running') push(t, 0, `Surgery "${cc.name}" has started in Theatre ${ti + 1}.`, {}, 'thrun');
        else if (cc.status === 'done') push(t, 0, `Surgery "${cc.name}" has finished.`, {}, 'thdone');
        else if (cc.status === 'held')
          push(t, 2, `Surgery "${cc.name}" is held: it will need an intensive-care bed afterwards, and none is free.`, {}, 'thheld');
        else if (cc.status === 'cancelled')
          push(t, 2, `Surgery "${cc.name}" has been cancelled — no intensive-care bed came free in time.`, { from: 'theatres', to: 'icu' }, 'thcancel');
      }
    }

    // --- emergency patients newly waiting for a ward bed ---
    if (cur.n.board > prev.n.board) {
      push(t, 1, `An emergency patient needs to be admitted, but there is no ward bed — they are waiting in an emergency bay.`, {}, 'board');
    }
  }

  return beats;
}

/** Plain-language labels for each area. */
export const STATION_INFO: Record<Exclude<Station, 'home'>, { title: string; blurb: string }> = {
  discharge: { title: 'Discharge', blurb: 'Patients well enough to go home — doing the paperwork.' },
  ward: { title: 'Ward', blurb: 'General beds. Most patients stay here.' },
  icu: { title: 'Intensive care', blurb: 'Beds for the sickest patients, closely watched.' },
  theatres: { title: 'Theatres', blurb: "Operating rooms for today's surgeries." },
  emergency: { title: 'Emergency', blurb: 'Where walk-in and ambulance patients are first seen.' },
};
