/* Nabz simulation core.
   Deterministic, minute-by-minute model of the bed chain in a small hospital:
   discharge paperwork -> ward beds -> intensive care -> theatres, plus emergency boarding.
   No network, no randomness outside the seed. Same inputs always give the same day.

   Ported verbatim from legacy/js/engine.js (simulate()), typed. The control flow,
   iteration order and arithmetic are preserved exactly so results are bit-identical. */

import { DAY_START, DAY_END, SNAP, merge } from './config.js';
import { hash, rng } from './rng.js';
import type {
  Config,
  SimulateOpts,
  SimulationResult,
  SimEvent,
  Snapshot,
  Metrics,
  DischargePatient,
  DemandItem,
  CancelledCase,
  TheatreCaseFull,
  Levels,
  DeptKey,
} from './types.js';

/* ---- internal working structures (mutable, local to one run) ---- */

interface WardBed {
  n: number;
  st: 'free' | 'occ' | 'dirty' | 'clean';
  kind: string | null;
  pid: string | null;
  until: number;
  dirtySince?: number;
  from?: string | null;
}

interface IcuBed {
  n: number;
  st: 'free' | 'occ' | 'clean' | 'res';
  kind: string | null;
  pid: string | null;
  until: number;
  readyAt: number | null;
  waitSince: number | null;
}

interface Dis {
  id: string;
  bed: number;
  insured: boolean;
  ordT: number;
  stage: string;
  skipSum: boolean;
  skipBill: boolean;
  apprDone: boolean;
  tOrd: number | null;
  tSum: number | null;
  tBill: number | null;
  tAppr: number | null;
  leaveBedAt: number | null;
  leftBed: number | null;
  tHome: number | null;
  tBedFree: number | null;
  until: number;
  inLounge: boolean;
}

interface TCase {
  id: string;
  name: string;
  est: number;
  icu: boolean;
  theatre: number;
  planned: number;
  dur: number;
  status: string;
  startT: number | null;
  endT: number | null;
  holdSince: number | null;
  cancelT: number | null;
  reason: string | null;
  icuBed: IcuBed | null;
  wardBed: WardBed | null;
}

interface Theatre {
  n: number;
  cases: TCase[];
  idx: number;
  cur: TCase | null;
  nextAt: number;
}

interface EdPatient {
  id: string;
  arr: number;
  acuity: number;
  needsWard: boolean;
  treat: number;
  bay: number | null;
  treatEnd: number | null;
  boardSince: number | null;
  bedAt: number | null;
  leftAt: number | null;
}

interface Planned {
  id: string;
  arr: number;
  status: string;
  bedAt: number | null;
}

interface StepDown {
  id: string;
  bed: IcuBed;
  ready: number;
  moved: number | null;
}

/* opts: { fixes:{id:true}, now:minute, seed:string, done:{patientId:{order,summary,bill,approval}},
           shocks:[{type:'accident'|'insuranceSlow'|'roundsLate', at:minute}] } */
export function simulate(cfg?: Partial<Config>, opts?: SimulateOpts): SimulationResult {
  opts = opts || {};
  const C = merge(cfg);
  const fx = opts.fixes || {};
  const now = opts.now == null ? 510 : opts.now;
  const seed = opts.seed || 'day-1';
  const R = rng(seed);
  const done = opts.done || {};
  const shocks = opts.shocks || [];
  const insuranceSlow = shocks.some((s) => s.type === 'insuranceSlow');
  const roundsLate = shocks.some((s) => s.type === 'roundsLate');

  const events: SimEvent[] = [];
  function log(t: number, dept: string, level: number, text: string): void {
    events.push({ t, dept, level, text });
  }

  /* ---------- ward ---------- */
  const ward: WardBed[] = [];
  let i: number;
  for (i = 0; i < C.wardBeds; i++) ward.push({ n: i + 1, st: 'free', kind: null, pid: null, until: 0 });
  const order = ward
    .map((_b, ix) => ix)
    .sort((a, b) => hash('layout|' + a) - hash('layout|' + b));
  const nSurg = C.theatres.reduce((s, l) => s + l.length, 0);
  const occ = Math.min(C.wardOccupied, C.wardBeds);
  const nDis = Math.min(C.fitForDischarge, Math.max(0, occ - nSurg));
  const dis: Dis[] = [];
  const surgBeds: WardBed[] = [];
  for (i = 0; i < occ; i++) {
    const bed = ward[order[i]];
    bed.st = 'occ';
    if (i < nDis) {
      const id = 'D' + (i + 1);
      const ins = i < Math.min(C.insured, nDis);
      bed.kind = 'ready';
      bed.pid = id;
      let base = C.orderWindow[0] + R.u('ord' + id) * (C.orderWindow[1] - C.orderWindow[0]);
      if (roundsLate) base += 60;
      let ordT = Math.round(base);
      if (fx.earlyRound) ordT = Math.min(ordT, Math.round(now + 5 + R.u('early' + id) * C.earlySpread));
      const d = done[id] || {};
      const anyDone = d.order || d.summary || d.bill || d.approval;
      if (anyDone) ordT = Math.min(ordT, now);
      dis.push({
        id,
        bed: bed.n,
        insured: ins,
        ordT,
        stage: 'wait',
        skipSum: !!(d.summary || d.bill),
        skipBill: !!d.bill,
        apprDone: !!d.approval,
        tOrd: null,
        tSum: null,
        tBill: null,
        tAppr: null,
        leaveBedAt: null,
        leftBed: null,
        tHome: null,
        tBedFree: null,
        until: 0,
        inLounge: false,
      });
    } else if (i < nDis + nSurg) {
      bed.kind = 'surg';
      bed.pid = 'S' + (i - nDis + 1);
      surgBeds.push(bed);
    } else {
      bed.kind = 'stay';
      bed.pid = 'W' + (i + 1);
    }
  }
  // quick-to-clear patients first in the queue numbering: cash patients are D(insured+1)..

  /* ---------- intensive care ---------- */
  const icu: IcuBed[] = [];
  for (i = 0; i < C.icuBeds; i++) {
    icu.push({
      n: i + 1,
      st: i < C.icuOccupied ? 'occ' : 'free',
      kind: i < C.icuOccupied ? 'stay' : null,
      pid: i < C.icuOccupied ? 'I' + (i + 1) : null,
      until: 0,
      readyAt: null,
      waitSince: null,
    });
  }
  const sdSlots = [1, 4, 2, 5, 0, 3];
  const stepDowns: StepDown[] = [];
  C.stepDowns.forEach((t, k) => {
    const b = icu[sdSlots[k % sdSlots.length]];
    if (b && b.st === 'occ') {
      b.readyAt = t;
      stepDowns.push({ id: b.pid as string, bed: b, ready: t, moved: null });
    }
  });

  /* ---------- theatres ---------- */
  let sIx = 0;
  const theatres: Theatre[] = C.theatres.map((list, ti) => {
    let planned = C.theatreOpen;
    const cases: TCase[] = list.map((c) => {
      const pid = 'S' + ++sIx;
      const o: TCase = {
        id: pid,
        name: c.name,
        est: c.est,
        icu: c.icu,
        theatre: ti + 1,
        planned,
        dur: Math.round(c.est * R.logn('surg' + pid, C.surgFactor.med, C.surgFactor.sig)),
        status: 'waiting',
        startT: null,
        endT: null,
        holdSince: null,
        cancelT: null,
        reason: null,
        icuBed: null,
        wardBed: surgBeds[sIx - 1] || null,
      };
      planned += Math.round(c.est * C.surgFactor.med) + 20;
      return o;
    });
    return { n: ti + 1, cases, idx: 0, cur: null, nextAt: C.theatreOpen };
  });
  const postOps: { at: number; c: TCase }[] = [];
  const closeT = fx.overtime ? C.overtimeClose : C.theatreClose;

  /* ---------- emergency ---------- */
  const arrivals: EdPatient[] = [];
  function mkEd(id: string, t: number, forceWard?: boolean | null, acu?: number): EdPatient {
    const a = acu || (R.u('acu' + id) < 0.15 ? 1 : R.u('acu' + id) < 0.5 ? 2 : 3);
    return {
      id,
      arr: t,
      acuity: a,
      needsWard: forceWard != null ? forceWard : R.u('adm' + id) < C.edWardShare[a],
      treat: Math.round(R.logn('trt' + id, C.edTreat[a], 0.25)),
      bay: null,
      treatEnd: null,
      boardSince: null,
      bedAt: null,
      leftAt: null,
    };
  }
  arrivals.push(mkEd('E0a', DAY_START - 30, false, 3));
  arrivals.push(mkEd('E0b', DAY_START - 15, false, 2));
  for (let m = DAY_START; m < DAY_END; m++) {
    if (R.u('edarr' + m) < C.edRatePerHour / 60) arrivals.push(mkEd('E' + m, m));
  }
  shocks.forEach((s, k) => {
    if (s.type !== 'accident') return;
    for (let j = 0; j < 6; j++) arrivals.push(mkEd('X' + k + j, s.at + j * 3, j < 3, j < 3 ? 1 : 2));
  });
  arrivals.sort((a, b) => a.arr - b.arr);
  const bays: (EdPatient | null)[] = [];
  for (i = 0; i < C.edBays; i++) bays.push(null);
  const edQueue: EdPatient[] = [];
  const edAll: EdPatient[] = [];
  let aIx = 0;

  /* ---------- planned admissions ---------- */
  const planned: Planned[] = C.plannedAdmissions.map((t, k) => {
    return { id: 'P' + (k + 1), arr: t, status: 'due', bedAt: null };
  });

  const cleaningTeams = C.housekeeping + (fx.housekeeping ? 1 : 0);
  const snaps: Snapshot[] = [];
  const cancelled: CancelledCase[] = [];
  let sdBlockedMin = 0;
  let firstJam: { dept: DeptKey; t: number } | null = null;

  function freeIcu(): IcuBed | null {
    for (let k = 0; k < icu.length; k++) if (icu[k].st === 'free') return icu[k];
    return null;
  }
  function cancelCase(c: TCase, t: number, reason: string): void {
    c.status = 'cancelled';
    c.cancelT = t;
    c.reason = reason;
    cancelled.push({ id: c.id, name: c.name, theatre: c.theatre, at: t, reason, planned: c.planned });
    log(t, 'th', 2, c.name + ' cancelled: ' + (reason === 'bed' ? 'no intensive care bed' : 'not enough theatre time'));
  }

  for (let t = DAY_START; t <= DAY_END; t++) {
    let k: number, p: EdPatient, b: WardBed;

    /* emergency arrivals and treatment */
    while (aIx < arrivals.length && arrivals[aIx].arr <= t) {
      edQueue.push(arrivals[aIx]);
      edAll.push(arrivals[aIx]);
      aIx++;
    }
    for (k = 0; k < bays.length; k++) {
      const pb = bays[k];
      if (pb && pb.boardSince == null && t >= (pb.treatEnd as number)) {
        if (pb.needsWard) {
          pb.boardSince = t;
          log(t, 'ed', 1, 'Emergency patient needs a ward bed');
        } else {
          pb.leftAt = t;
          bays[k] = null;
        }
      }
    }
    edQueue.sort((x, y) => x.acuity - y.acuity || x.arr - y.arr);
    for (k = 0; k < bays.length && edQueue.length; k++) {
      if (!bays[k]) {
        p = edQueue.shift() as EdPatient;
        p.bay = k;
        p.treatEnd = Math.max(t, p.arr) + p.treat;
        bays[k] = p;
      }
    }

    /* discharge paperwork */
    let inSum = 0,
      inBill = 0;
    for (k = 0; k < dis.length; k++) {
      if (dis[k].stage === 'sum') inSum++;
      if (dis[k].stage === 'bill') inBill++;
    }
    for (k = 0; k < dis.length; k++) {
      const pd = dis[k];
      if (pd.stage === 'wait' && t >= pd.ordT) {
        pd.stage = 'sumQ';
        pd.tOrd = t;
      }
      if (pd.stage === 'sum' && t >= pd.until) {
        pd.stage = 'billQ';
        pd.tSum = t;
        inSum--;
      }
      if (pd.stage === 'sumQ' && pd.skipSum) {
        pd.stage = 'billQ';
        pd.tSum = t;
      }
      if (pd.stage === 'bill' && t >= pd.until) {
        pd.stage = 'billed';
        inBill--;
      }
      if (pd.stage === 'billQ' && pd.skipBill) {
        pd.stage = 'billed';
      }
      if (pd.stage === 'billed') {
        pd.tBill = t;
        if (pd.insured && !pd.apprDone) {
          let ad = R.logn('appr' + pd.id, C.approval.med, C.approval.sig);
          if (fx.prefile) ad *= C.prefileFactor;
          if (insuranceSlow) ad *= 1.6;
          pd.stage = 'appr';
          pd.until = t + Math.round(ad);
          pd.leaveBedAt = fx.lounge ? t + 10 : pd.until + 15;
        } else {
          pd.stage = 'pack';
          pd.tAppr = pd.insured ? t : null;
          pd.until = t + 15;
          pd.leaveBedAt = t + 15;
        }
      }
      if (pd.stage === 'appr' && t >= pd.until) {
        pd.stage = 'pack';
        pd.tAppr = t;
        pd.until = Math.max(t, pd.leaveBedAt as number);
      }
      if (pd.leftBed == null && pd.leaveBedAt != null && t >= pd.leaveBedAt) {
        pd.leftBed = t;
        b = ward[pd.bed - 1];
        b.st = 'dirty';
        b.kind = null;
        b.pid = null;
        b.dirtySince = t;
        b.from = pd.id;
        pd.inLounge = pd.stage === 'appr';
      }
      if (pd.stage === 'pack' && pd.leftBed != null && t >= pd.until) {
        pd.stage = 'gone';
        pd.tHome = t;
        pd.inLounge = false;
      }
    }
    const sumQ = dis
      .filter((x) => x.stage === 'sumQ')
      .sort((x, y) => (x.tOrd as number) - (y.tOrd as number) || (Number(x.insured) - Number(y.insured)));
    while (inSum < (C.summary.servers as number) && sumQ.length) {
      const ps = sumQ.shift() as Dis;
      ps.stage = 'sum';
      ps.until = t + Math.round(R.logn('sum' + ps.id, C.summary.med, C.summary.sig));
      inSum++;
    }
    const billQ = dis.filter((x) => x.stage === 'billQ').sort((x, y) => (x.tSum as number) - (y.tSum as number));
    while (inBill < (C.bill.servers as number) && billQ.length) {
      const pb2 = billQ.shift() as Dis;
      pb2.stage = 'bill';
      pb2.until = t + Math.round(R.logn('bill' + pb2.id, C.bill.med, C.bill.sig));
      inBill++;
    }

    /* housekeeping */
    let cleaningNow = 0;
    for (k = 0; k < ward.length; k++) {
      b = ward[k];
      if (b.st === 'clean' && t >= b.until) {
        b.st = 'free';
        if (b.from) {
          for (let q = 0; q < dis.length; q++) if (dis[q].id === b.from) dis[q].tBedFree = t;
          b.from = null;
        }
      }
      if (b.st === 'clean') cleaningNow++;
    }
    const dirty = ward.filter((x) => x.st === 'dirty').sort((x, y) => (x.dirtySince as number) - (y.dirtySince as number));
    while (cleaningNow < cleaningTeams && dirty.length) {
      b = dirty.shift() as WardBed;
      b.st = 'clean';
      b.until = t + C.cleanMin;
      cleaningNow++;
    }
    for (k = 0; k < icu.length; k++) if (icu[k].st === 'clean' && t >= icu[k].until) icu[k].st = 'free';

    /* theatres */
    for (k = 0; k < theatres.length; k++) {
      const th = theatres[k];
      let c: TCase;
      if (th.cur && t >= (th.cur.endT as number)) {
        c = th.cur;
        c.status = 'done';
        th.cur = null;
        th.nextAt = t + 20;
        postOps.push({ at: t + 40, c });
      }
      let guard = 0;
      while (!th.cur && th.idx < th.cases.length && t >= th.nextAt && guard++ < 6) {
        c = th.cases[th.idx];
        if (t + c.est * 1.1 > closeT) {
          cancelCase(c, t, 'time');
          th.idx++;
          continue;
        }
        if (c.icu) {
          const ib = freeIcu();
          if (!ib) {
            if (c.holdSince == null) {
              c.holdSince = t;
              c.status = 'held';
              log(t, 'th', 2, c.name + ' held: no intensive care bed for after surgery');
            }
            if (t - c.holdSince >= C.holdMax) {
              cancelCase(c, t, 'bed');
              th.idx++;
              continue;
            }
            break;
          }
          ib.st = 'res';
          ib.kind = 'reserved';
          ib.pid = c.id;
          c.icuBed = ib;
        }
        c.status = 'running';
        c.startT = t;
        c.endT = t + c.dur;
        th.cur = c;
        th.idx++;
      }
    }
    for (k = postOps.length - 1; k >= 0; k--) {
      if (t >= postOps[k].at) {
        const c = postOps[k].c;
        postOps.splice(k, 1);
        if (c.icu && c.icuBed) {
          c.icuBed.st = 'occ';
          c.icuBed.kind = 'postop';
          c.icuBed.pid = c.id;
          if (c.wardBed) {
            c.wardBed.st = 'dirty';
            c.wardBed.kind = null;
            c.wardBed.pid = null;
            c.wardBed.dirtySince = t;
          }
        }
      }
    }

    /* who is waiting for a ward bed */
    for (k = 0; k < planned.length; k++) {
      const pp = planned[k];
      if (pp.status === 'due' && t >= pp.arr) pp.status = 'waiting';
      if (pp.status === 'waiting' && (t - pp.arr >= C.admissionPatience || t >= DAY_END - 60)) {
        pp.status = 'putoff';
        log(t, 'ward', 1, 'A planned admission is put off to tomorrow');
      }
    }
    const boarders = bays
      .filter((x): x is EdPatient => !!x && x.boardSince != null)
      .sort((x, y) => x.acuity - y.acuity || (x.boardSince as number) - (y.boardSince as number));
    const sdWait = stepDowns.filter((s) => s.moved == null && t >= s.ready);
    const plWait = planned.filter((x) => x.status === 'waiting');
    const freeBeds = ward.filter((x) => x.st === 'free');
    while (freeBeds.length && (boarders.length || sdWait.length || plWait.length)) {
      b = freeBeds.shift() as WardBed;
      b.st = 'occ';
      b.kind = 'new';
      if (boarders.length) {
        p = boarders.shift() as EdPatient;
        p.bedAt = t;
        bays[p.bay as number] = null;
        b.pid = p.id;
      } else if (sdWait.length) {
        const s = sdWait.shift() as StepDown;
        s.moved = t;
        b.pid = s.id;
        s.bed.st = 'clean';
        s.bed.until = t + C.cleanMin;
        s.bed.kind = null;
        s.bed.pid = null;
        s.bed.readyAt = null;
        log(t, 'icu', 0, 'Intensive care patient moved to the ward');
      } else {
        const pl = plWait.shift() as Planned;
        pl.status = 'admitted';
        pl.bedAt = t;
        b.pid = pl.id;
      }
    }
    sdBlockedMin += sdWait.length;

    /* department levels */
    const nBoard = boarders.length,
      nQueue = edQueue.length;
    const busyBays = bays.filter((x) => x).length;
    const nFree = ward.filter((x) => x.st === 'free').length;
    const waitingWard = nBoard + sdWait.length + plWait.length;
    const icuFree = icu.filter((x) => x.st === 'free').length;
    let held = 0,
      recentCancel = 0,
      late = 0;
    theatres.forEach((th2) => {
      th2.cases.forEach((cc) => {
        if (cc.status === 'held') held++;
        if (cc.status === 'cancelled' && t - (cc.cancelT as number) <= 120) recentCancel++;
        if (cc.status === 'running' && (cc.startT as number) - cc.planned > 40) late++;
      });
    });
    const notOrdered = dis.filter((x) => x.stage === 'wait').length;
    const inProgress = dis.filter((x) => x.tOrd != null && x.leftBed == null);
    const slowest = inProgress.reduce((mx, x) => Math.max(mx, t - (x.tOrd as number)), 0);
    const stillInBed = dis.filter((x) => x.leftBed == null).length;
    const lv: Levels = {
      ed: nBoard >= 2 || nQueue >= 2 ? 2 : nBoard === 1 || nQueue === 1 || busyBays >= C.edBays - 1 ? 1 : 0,
      icu: sdWait.length ? 2 : icuFree === 0 ? 1 : 0,
      ward: nFree === 0 && waitingWard > 0 ? 2 : nFree <= 1 ? 1 : 0,
      th: held || recentCancel ? 2 : late ? 1 : 0,
      dis: slowest > 300 ? 2 : slowest > 180 || (t >= 600 && notOrdered > 0) ? 1 : 0,
    };
    if (!firstJam && t >= now) {
      const orderDept: DeptKey[] = ['icu', 'th', 'ed', 'ward', 'dis'];
      for (k = 0; k < orderDept.length; k++)
        if (lv[orderDept[k]] === 2) {
          firstJam = { dept: orderDept[k], t };
          break;
        }
    }

    if ((t - DAY_START) % SNAP === 0) {
      snaps.push({
        t,
        ward: ward.map((x) => {
          let stage: string | null = null;
          if (x.kind === 'ready') {
            for (let z = 0; z < dis.length; z++) if (dis[z].id === x.pid) stage = dis[z].stage;
          }
          return { n: x.n, st: x.st, kind: x.kind, pid: x.pid, stage: stage as never };
        }),
        icu: icu.map((x) => {
          return {
            n: x.n,
            st: x.st,
            kind: x.kind,
            pid: x.pid,
            blocked: x.readyAt != null && t >= x.readyAt ? t - x.readyAt : null,
          };
        }),
        ed: bays.map((x) => {
          return x ? { pid: x.id, acuity: x.acuity, board: x.boardSince != null ? t - x.boardSince : null } : null;
        }),
        edQueue: nQueue,
        th: theatres.map((th3) => {
          return th3.cases.map((cc) => {
            return {
              id: cc.id,
              name: cc.name,
              icu: cc.icu,
              status: cc.status,
              planned: cc.planned,
              startT: cc.startT,
              endT: cc.endT,
              cancelT: cc.cancelT,
              reason: cc.reason,
              hold: cc.status === 'held' ? t - (cc.holdSince as number) : null,
            };
          });
        }),
        lounge: dis.filter((x) => x.inLounge).length,
        gone: dis.filter((x) => x.leftBed != null).length,
        n: {
          board: nBoard,
          sd: sdWait.length,
          plan: plWait.length,
          free: nFree,
          icuFree,
          notOrdered,
          stillInBed,
          slowest,
          held,
          busyBays,
        },
        lv,
      });
    }
  }

  /* ---------- results ---------- */
  let boardMin = 0,
    boardCount = 0,
    longestBoard = 0;
  edAll.forEach((p2) => {
    if (p2.boardSince != null) {
      const w = (p2.bedAt != null ? p2.bedAt : DAY_END) - p2.boardSince;
      boardMin += w;
      boardCount++;
      longestBoard = Math.max(longestBoard, w);
    }
  });
  const freeTimes = dis.map((x) => (x.tBedFree != null ? x.tBedFree : DAY_END));
  const avgBedFree = freeTimes.length ? freeTimes.reduce((a, c2) => a + c2, 0) / freeTimes.length : null;
  const homeHours = dis
    .filter((x) => x.tHome != null && x.tOrd != null)
    .map((x) => ((x.tHome as number) - (x.tOrd as number)) / 60);
  const putOff = planned.filter((x) => x.status === 'putoff' || x.status === 'waiting').length;
  const bedCancels = cancelled.filter((x) => x.reason === 'bed').length;

  const demand: DemandItem[] = [];
  stepDowns.forEach((s2, n2) => {
    demand.push({ t: s2.ready, kind: 'sd', n: n2 + 1 });
  });
  edAll.forEach((p3) => {
    if (p3.boardSince != null) demand.push({ t: p3.boardSince, kind: 'ed' });
  });
  planned.forEach((p4) => {
    demand.push({ t: p4.arr, kind: 'plan' });
  });
  demand.sort((a, c3) => a.t - c3.t);

  const W = C.weights;
  const metrics: Metrics = {
    cancelled,
    cancelCount: cancelled.length,
    bedCancels,
    boardHours: boardMin / 60,
    boardCount,
    longestBoard,
    blockedHours: sdBlockedMin / 60,
    avgBedFree,
    putOff,
    dischargeHours: homeHours.length ? homeHours.reduce((a, c4) => a + c4, 0) / homeHours.length : null,
    leftToday: dis.filter((x) => x.leftBed != null).length,
    firstJam,
    cost: 0,
  };
  metrics.cost =
    W.cancel * metrics.cancelCount + W.board * metrics.boardHours + W.blocked * metrics.blockedHours + W.putOff * putOff;

  return {
    snaps,
    events,
    metrics,
    dis: dis as unknown as DischargePatient[],
    demand,
    cases: theatres.map((th4) =>
      th4.cases.map((c): TheatreCaseFull => ({
        id: c.id,
        name: c.name,
        est: c.est,
        icu: c.icu,
        theatre: c.theatre,
        planned: c.planned,
        dur: c.dur,
        status: c.status,
        startT: c.startT,
        endT: c.endT,
        holdSince: c.holdSince,
        cancelT: c.cancelT,
        reason: c.reason,
      })),
    ),
    config: C,
    now,
  };
}
