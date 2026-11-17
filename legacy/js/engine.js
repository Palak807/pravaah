/* Nabz simulation engine.
   Deterministic, minute-by-minute model of the bed chain in a small hospital:
   discharge paperwork -> ward beds -> intensive care -> theatres, plus emergency boarding.
   No network, no randomness outside the seed. Same inputs always give the same day. */
(function (root) {
  'use strict';

  var DAY_START = 480;   // 08:00
  var DAY_END = 1260;    // 21:00
  var SNAP = 5;          // minutes between stored snapshots

  var DEFAULTS = {
    wardBeds: 24, wardOccupied: 24,
    icuBeds: 6, icuOccupied: 6,
    edBays: 6,
    fitForDischarge: 9, insured: 6,
    stepDowns: [600, 645],                       // ICU patients ready for the ward at 10:00 and 10:45
    theatres: [
      [ { name: 'Gallbladder removal', est: 90, icu: false },
        { name: 'Hernia repair', est: 90, icu: false },
        { name: 'Thyroid surgery', est: 75, icu: false },
        { name: 'Appendix removal', est: 60, icu: false } ],
      [ { name: 'Hip replacement', est: 120, icu: false },
        { name: 'Bowel surgery', est: 120, icu: true },
        { name: 'Spine surgery', est: 90, icu: true } ]
    ],
    plannedAdmissions: [815, 850, 890, 930, 975],
    theatreOpen: 540, theatreClose: 1050, overtimeClose: 1170,
    orderWindow: [690, 810],                     // discharge orders written 11:30 to 13:30 by default
    earlySpread: 20,                             // with early rounds: within 20 minutes of the decision
    summary: { med: 55, sig: 0.22, servers: 2 },
    bill: { med: 35, sig: 0.18, servers: 1 },
    approval: { med: 150, sig: 0.28 },
    prefileFactor: 0.4,
    cleanMin: 30, housekeeping: 1,
    holdMax: 75,
    surgFactor: { med: 1.15, sig: 0.1 },
    edRatePerHour: 1.8,
    edWardShare: { 1: 0.5, 2: 0.26, 3: 0.05 },
    edTreat: { 1: 110, 2: 80, 3: 45 },
    admissionPatience: 240,
    weights: { cancel: 60, board: 4, blocked: 6, putOff: 30 }
  };

  var FIXES = [
    { id: 'earlyRound', name: 'Do discharge rounds first thing', owner: 'Medical superintendent',
      what: 'Doctors write discharge orders before clinic starts, not after.' },
    { id: 'lounge', name: 'Open a discharge lounge', owner: 'Nursing in-charge',
      what: 'Insured patients wait for approval in a lounge, so the bed is freed once the bill is closed.' },
    { id: 'prefile', name: 'Send insurance papers early', owner: 'Insurance desk',
      what: 'File the discharge request with the insurer while the summary is being written.' },
    { id: 'housekeeping', name: 'Add a second cleaning team', owner: 'Housekeeping supervisor',
      what: 'Two teams turn beds around after patients leave.' },
    { id: 'overtime', name: 'Allow two hours of theatre overtime', owner: 'Theatre in-charge',
      what: 'Theatres may run until 19:30 if a case is delayed.' }
  ];

  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
  function rng(seed) {
    function u(k) { return hash(seed + '|' + k); }
    function norm(k) {
      var a = Math.max(u(k + 'a'), 1e-9), b = u(k + 'b');
      return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
    }
    return { u: u, logn: function (k, med, sig) { return med * Math.exp(sig * norm(k)); } };
  }

  function merge(cfg) {
    var C = {}, k;
    for (k in DEFAULTS) C[k] = DEFAULTS[k];
    for (k in (cfg || {})) C[k] = cfg[k];
    return C;
  }

  /* opts: { fixes:{id:true}, now:minute, seed:string, done:{patientId:{order,summary,bill,approval}},
             shocks:[{type:'accident'|'insuranceSlow'|'roundsLate', at:minute}] } */
  function simulate(cfg, opts) {
    opts = opts || {};
    var C = merge(cfg);
    var fx = opts.fixes || {};
    var now = opts.now == null ? 510 : opts.now;
    var seed = opts.seed || 'day-1';
    var R = rng(seed);
    var done = opts.done || {};
    var shocks = opts.shocks || [];
    var insuranceSlow = shocks.some(function (s) { return s.type === 'insuranceSlow'; });
    var roundsLate = shocks.some(function (s) { return s.type === 'roundsLate'; });

    var events = [];
    function log(t, dept, level, text) { events.push({ t: t, dept: dept, level: level, text: text }); }

    /* ---------- ward ---------- */
    var ward = [], i;
    for (i = 0; i < C.wardBeds; i++) ward.push({ n: i + 1, st: 'free', kind: null, pid: null, until: 0 });
    var order = ward.map(function (b, ix) { return ix; }).sort(function (a, b) {
      return hash('layout|' + a) - hash('layout|' + b);
    });
    var nSurg = C.theatres.reduce(function (s, l) { return s + l.length; }, 0);
    var occ = Math.min(C.wardOccupied, C.wardBeds);
    var nDis = Math.min(C.fitForDischarge, Math.max(0, occ - nSurg));
    var dis = [], surgBeds = [];
    for (i = 0; i < occ; i++) {
      var bed = ward[order[i]];
      bed.st = 'occ';
      if (i < nDis) {
        var id = 'D' + (i + 1);
        var ins = i < Math.min(C.insured, nDis);
        bed.kind = 'ready'; bed.pid = id;
        var base = C.orderWindow[0] + R.u('ord' + id) * (C.orderWindow[1] - C.orderWindow[0]);
        if (roundsLate) base += 60;
        var ordT = Math.round(base);
        if (fx.earlyRound) ordT = Math.min(ordT, Math.round(now + 5 + R.u('early' + id) * C.earlySpread));
        var d = done[id] || {};
        var anyDone = d.order || d.summary || d.bill || d.approval;
        if (anyDone) ordT = Math.min(ordT, now);
        dis.push({ id: id, bed: bed.n, insured: ins, ordT: ordT, stage: 'wait',
          skipSum: !!(d.summary || d.bill), skipBill: !!d.bill, apprDone: !!d.approval,
          tOrd: null, tSum: null, tBill: null, tAppr: null, leaveBedAt: null, leftBed: null, tHome: null,
          tBedFree: null, until: 0, inLounge: false });
      } else if (i < nDis + nSurg) {
        bed.kind = 'surg'; bed.pid = 'S' + (i - nDis + 1); surgBeds.push(bed);
      } else { bed.kind = 'stay'; bed.pid = 'W' + (i + 1); }
    }
    // quick-to-clear patients first in the queue numbering: cash patients are D(insured+1)..

    /* ---------- intensive care ---------- */
    var icu = [];
    for (i = 0; i < C.icuBeds; i++) {
      icu.push({ n: i + 1, st: i < C.icuOccupied ? 'occ' : 'free', kind: i < C.icuOccupied ? 'stay' : null,
        pid: i < C.icuOccupied ? 'I' + (i + 1) : null, until: 0, readyAt: null, waitSince: null });
    }
    var sdSlots = [1, 4, 2, 5, 0, 3];
    var stepDowns = [];
    C.stepDowns.forEach(function (t, k) {
      var b = icu[sdSlots[k % sdSlots.length]];
      if (b && b.st === 'occ') { b.readyAt = t; stepDowns.push({ id: b.pid, bed: b, ready: t, moved: null }); }
    });

    /* ---------- theatres ---------- */
    var sIx = 0;
    var theatres = C.theatres.map(function (list, ti) {
      var planned = C.theatreOpen;
      var cases = list.map(function (c, ci) {
        var pid = 'S' + (++sIx);
        var o = { id: pid, name: c.name, est: c.est, icu: c.icu, theatre: ti + 1, planned: planned,
          dur: Math.round(c.est * R.logn('surg' + pid, C.surgFactor.med, C.surgFactor.sig)),
          status: 'waiting', startT: null, endT: null, holdSince: null, cancelT: null, reason: null,
          icuBed: null, wardBed: surgBeds[sIx - 1] || null };
        planned += Math.round(c.est * C.surgFactor.med) + 20;
        return o;
      });
      return { n: ti + 1, cases: cases, idx: 0, cur: null, nextAt: C.theatreOpen };
    });
    var postOps = [];
    var closeT = fx.overtime ? C.overtimeClose : C.theatreClose;

    /* ---------- emergency ---------- */
    var arrivals = [];
    function mkEd(id, t, forceWard, acu) {
      var a = acu || (R.u('acu' + id) < 0.15 ? 1 : (R.u('acu' + id) < 0.5 ? 2 : 3));
      return { id: id, arr: t, acuity: a,
        needsWard: forceWard != null ? forceWard : R.u('adm' + id) < C.edWardShare[a],
        treat: Math.round(R.logn('trt' + id, C.edTreat[a], 0.25)),
        bay: null, treatEnd: null, boardSince: null, bedAt: null, leftAt: null };
    }
    arrivals.push(mkEd('E0a', DAY_START - 30, false, 3));
    arrivals.push(mkEd('E0b', DAY_START - 15, false, 2));
    for (var m = DAY_START; m < DAY_END; m++) {
      if (R.u('edarr' + m) < C.edRatePerHour / 60) arrivals.push(mkEd('E' + m, m));
    }
    shocks.forEach(function (s, k) {
      if (s.type !== 'accident') return;
      for (var j = 0; j < 6; j++) arrivals.push(mkEd('X' + k + j, s.at + j * 3, j < 3, j < 3 ? 1 : 2));
    });
    arrivals.sort(function (a, b) { return a.arr - b.arr; });
    var bays = []; for (i = 0; i < C.edBays; i++) bays.push(null);
    var edQueue = [], edAll = [], aIx = 0;

    /* ---------- planned admissions ---------- */
    var planned = C.plannedAdmissions.map(function (t, k) {
      return { id: 'P' + (k + 1), arr: t, status: 'due', bedAt: null };
    });

    var cleaningTeams = C.housekeeping + (fx.housekeeping ? 1 : 0);
    var snaps = [], cancelled = [], sdBlockedMin = 0;
    var firstJam = null;

    function freeIcu() { for (var k = 0; k < icu.length; k++) if (icu[k].st === 'free') return icu[k]; return null; }
    function cancelCase(c, t, reason) {
      c.status = 'cancelled'; c.cancelT = t; c.reason = reason;
      cancelled.push({ id: c.id, name: c.name, theatre: c.theatre, at: t, reason: reason, planned: c.planned });
      log(t, 'th', 2, c.name + ' cancelled: ' + (reason === 'bed' ? 'no intensive care bed' : 'not enough theatre time'));
    }

    for (var t = DAY_START; t <= DAY_END; t++) {
      var k, p, b;

      /* emergency arrivals and treatment */
      while (aIx < arrivals.length && arrivals[aIx].arr <= t) { edQueue.push(arrivals[aIx]); edAll.push(arrivals[aIx]); aIx++; }
      for (k = 0; k < bays.length; k++) {
        p = bays[k];
        if (p && p.boardSince == null && t >= p.treatEnd) {
          if (p.needsWard) { p.boardSince = t; log(t, 'ed', 1, 'Emergency patient needs a ward bed'); }
          else { p.leftAt = t; bays[k] = null; }
        }
      }
      edQueue.sort(function (x, y) { return x.acuity - y.acuity || x.arr - y.arr; });
      for (k = 0; k < bays.length && edQueue.length; k++) {
        if (!bays[k]) { p = edQueue.shift(); p.bay = k; p.treatEnd = Math.max(t, p.arr) + p.treat; bays[k] = p; }
      }

      /* discharge paperwork */
      var inSum = 0, inBill = 0;
      for (k = 0; k < dis.length; k++) { if (dis[k].stage === 'sum') inSum++; if (dis[k].stage === 'bill') inBill++; }
      for (k = 0; k < dis.length; k++) {
        p = dis[k];
        if (p.stage === 'wait' && t >= p.ordT) { p.stage = 'sumQ'; p.tOrd = t; }
        if (p.stage === 'sum' && t >= p.until) { p.stage = 'billQ'; p.tSum = t; inSum--; }
        if (p.stage === 'sumQ' && p.skipSum) { p.stage = 'billQ'; p.tSum = t; }
        if (p.stage === 'bill' && t >= p.until) { p.stage = 'billed'; inBill--; }
        if (p.stage === 'billQ' && p.skipBill) { p.stage = 'billed'; }
        if (p.stage === 'billed') {
          p.tBill = t;
          if (p.insured && !p.apprDone) {
            var ad = R.logn('appr' + p.id, C.approval.med, C.approval.sig);
            if (fx.prefile) ad *= C.prefileFactor;
            if (insuranceSlow) ad *= 1.6;
            p.stage = 'appr'; p.until = t + Math.round(ad);
            p.leaveBedAt = fx.lounge ? t + 10 : p.until + 15;
          } else { p.stage = 'pack'; p.tAppr = p.insured ? t : null; p.until = t + 15; p.leaveBedAt = t + 15; }
        }
        if (p.stage === 'appr' && t >= p.until) { p.stage = 'pack'; p.tAppr = t; p.until = Math.max(t, p.leaveBedAt); }
        if (p.leftBed == null && p.leaveBedAt != null && t >= p.leaveBedAt) {
          p.leftBed = t; b = ward[p.bed - 1]; b.st = 'dirty'; b.kind = null; b.pid = null; b.dirtySince = t; b.from = p.id;
          p.inLounge = p.stage === 'appr';
        }
        if (p.stage === 'pack' && p.leftBed != null && t >= p.until) { p.stage = 'gone'; p.tHome = t; p.inLounge = false; }
      }
      var sumQ = dis.filter(function (x) { return x.stage === 'sumQ'; }).sort(function (x, y) { return x.tOrd - y.tOrd || (x.insured - y.insured); });
      while (inSum < C.summary.servers && sumQ.length) {
        p = sumQ.shift(); p.stage = 'sum'; p.until = t + Math.round(R.logn('sum' + p.id, C.summary.med, C.summary.sig)); inSum++;
      }
      var billQ = dis.filter(function (x) { return x.stage === 'billQ'; }).sort(function (x, y) { return x.tSum - y.tSum; });
      while (inBill < C.bill.servers && billQ.length) {
        p = billQ.shift(); p.stage = 'bill'; p.until = t + Math.round(R.logn('bill' + p.id, C.bill.med, C.bill.sig)); inBill++;
      }

      /* housekeeping */
      var cleaningNow = 0;
      for (k = 0; k < ward.length; k++) {
        b = ward[k];
        if (b.st === 'clean' && t >= b.until) {
          b.st = 'free';
          if (b.from) { for (var q = 0; q < dis.length; q++) if (dis[q].id === b.from) dis[q].tBedFree = t; b.from = null; }
        }
        if (b.st === 'clean') cleaningNow++;
      }
      var dirty = ward.filter(function (x) { return x.st === 'dirty'; }).sort(function (x, y) { return x.dirtySince - y.dirtySince; });
      while (cleaningNow < cleaningTeams && dirty.length) { b = dirty.shift(); b.st = 'clean'; b.until = t + C.cleanMin; cleaningNow++; }
      for (k = 0; k < icu.length; k++) if (icu[k].st === 'clean' && t >= icu[k].until) icu[k].st = 'free';

      /* theatres */
      for (k = 0; k < theatres.length; k++) {
        var th = theatres[k], c;
        if (th.cur && t >= th.cur.endT) {
          c = th.cur; c.status = 'done'; th.cur = null; th.nextAt = t + 20;
          postOps.push({ at: t + 40, c: c });
        }
        var guard = 0;
        while (!th.cur && th.idx < th.cases.length && t >= th.nextAt && guard++ < 6) {
          c = th.cases[th.idx];
          if (t + c.est * 1.1 > closeT) { cancelCase(c, t, 'time'); th.idx++; continue; }
          if (c.icu) {
            var ib = freeIcu();
            if (!ib) {
              if (c.holdSince == null) { c.holdSince = t; c.status = 'held'; log(t, 'th', 2, c.name + ' held: no intensive care bed for after surgery'); }
              if (t - c.holdSince >= C.holdMax) { cancelCase(c, t, 'bed'); th.idx++; continue; }
              break;
            }
            ib.st = 'res'; ib.kind = 'reserved'; ib.pid = c.id; c.icuBed = ib;
          }
          c.status = 'running'; c.startT = t; c.endT = t + c.dur; th.cur = c; th.idx++;
        }
      }
      for (k = postOps.length - 1; k >= 0; k--) {
        if (t >= postOps[k].at) {
          c = postOps[k].c; postOps.splice(k, 1);
          if (c.icu && c.icuBed) {
            c.icuBed.st = 'occ'; c.icuBed.kind = 'postop'; c.icuBed.pid = c.id;
            if (c.wardBed) { c.wardBed.st = 'dirty'; c.wardBed.kind = null; c.wardBed.pid = null; c.wardBed.dirtySince = t; }
          }
        }
      }

      /* who is waiting for a ward bed */
      for (k = 0; k < planned.length; k++) {
        p = planned[k];
        if (p.status === 'due' && t >= p.arr) p.status = 'waiting';
        if (p.status === 'waiting' && (t - p.arr >= C.admissionPatience || t >= DAY_END - 60)) {
          p.status = 'putoff'; log(t, 'ward', 1, 'A planned admission is put off to tomorrow');
        }
      }
      var boarders = bays.filter(function (x) { return x && x.boardSince != null; })
        .sort(function (x, y) { return x.acuity - y.acuity || x.boardSince - y.boardSince; });
      var sdWait = stepDowns.filter(function (s) { return s.moved == null && t >= s.ready; });
      var plWait = planned.filter(function (x) { return x.status === 'waiting'; });
      var freeBeds = ward.filter(function (x) { return x.st === 'free'; });
      while (freeBeds.length && (boarders.length || sdWait.length || plWait.length)) {
        b = freeBeds.shift(); b.st = 'occ'; b.kind = 'new';
        if (boarders.length) {
          p = boarders.shift(); p.bedAt = t; bays[p.bay] = null; b.pid = p.id;
        } else if (sdWait.length) {
          var s = sdWait.shift(); s.moved = t; b.pid = s.id;
          s.bed.st = 'clean'; s.bed.until = t + C.cleanMin; s.bed.kind = null; s.bed.pid = null; s.bed.readyAt = null;
          log(t, 'icu', 0, 'Intensive care patient moved to the ward');
        } else {
          p = plWait.shift(); p.status = 'admitted'; p.bedAt = t; b.pid = p.id;
        }
      }
      sdBlockedMin += sdWait.length;

      /* department levels */
      var nBoard = boarders.length, nQueue = edQueue.length;
      var busyBays = bays.filter(function (x) { return x; }).length;
      var nFree = ward.filter(function (x) { return x.st === 'free'; }).length;
      var waitingWard = nBoard + sdWait.length + plWait.length;
      var icuFree = icu.filter(function (x) { return x.st === 'free'; }).length;
      var held = 0, recentCancel = 0, late = 0;
      theatres.forEach(function (th2) {
        th2.cases.forEach(function (cc) {
          if (cc.status === 'held') held++;
          if (cc.status === 'cancelled' && t - cc.cancelT <= 120) recentCancel++;
          if (cc.status === 'running' && cc.startT - cc.planned > 40) late++;
        });
      });
      var notOrdered = dis.filter(function (x) { return x.stage === 'wait'; }).length;
      var inProgress = dis.filter(function (x) { return x.tOrd != null && x.leftBed == null; });
      var slowest = inProgress.reduce(function (mx, x) { return Math.max(mx, t - x.tOrd); }, 0);
      var stillInBed = dis.filter(function (x) { return x.leftBed == null; }).length;
      var lv = {
        ed: (nBoard >= 2 || nQueue >= 2) ? 2 : ((nBoard === 1 || nQueue === 1 || busyBays >= C.edBays - 1) ? 1 : 0),
        icu: sdWait.length ? 2 : (icuFree === 0 ? 1 : 0),
        ward: (nFree === 0 && waitingWard > 0) ? 2 : (nFree <= 1 ? 1 : 0),
        th: (held || recentCancel) ? 2 : (late ? 1 : 0),
        dis: slowest > 300 ? 2 : ((slowest > 180 || (t >= 600 && notOrdered > 0)) ? 1 : 0)
      };
      if (!firstJam && t >= now) {
        var orderDept = ['icu', 'th', 'ed', 'ward', 'dis'];
        for (k = 0; k < orderDept.length; k++) if (lv[orderDept[k]] === 2) { firstJam = { dept: orderDept[k], t: t }; break; }
      }

      if ((t - DAY_START) % SNAP === 0) {
        snaps.push({
          t: t,
          ward: ward.map(function (x) {
            var stage = null;
            if (x.kind === 'ready') { for (var z = 0; z < dis.length; z++) if (dis[z].id === x.pid) stage = dis[z].stage; }
            return { n: x.n, st: x.st, kind: x.kind, pid: x.pid, stage: stage };
          }),
          icu: icu.map(function (x) {
            return { n: x.n, st: x.st, kind: x.kind, pid: x.pid,
              blocked: x.readyAt != null && t >= x.readyAt ? t - x.readyAt : null };
          }),
          ed: bays.map(function (x) {
            return x ? { pid: x.id, acuity: x.acuity, board: x.boardSince != null ? t - x.boardSince : null } : null;
          }),
          edQueue: nQueue,
          th: theatres.map(function (th3) {
            return th3.cases.map(function (cc) {
              return { id: cc.id, name: cc.name, icu: cc.icu, status: cc.status, planned: cc.planned,
                startT: cc.startT, endT: cc.endT, cancelT: cc.cancelT, reason: cc.reason,
                hold: cc.status === 'held' ? t - cc.holdSince : null };
            });
          }),
          lounge: dis.filter(function (x) { return x.inLounge; }).length,
          gone: dis.filter(function (x) { return x.leftBed != null; }).length,
          n: { board: nBoard, sd: sdWait.length, plan: plWait.length, free: nFree, icuFree: icuFree,
               notOrdered: notOrdered, stillInBed: stillInBed, slowest: slowest, held: held, busyBays: busyBays },
          lv: lv
        });
      }
    }

    /* ---------- results ---------- */
    var boardMin = 0, boardCount = 0, longestBoard = 0;
    edAll.forEach(function (p2) {
      if (p2.boardSince != null) {
        var w = (p2.bedAt != null ? p2.bedAt : DAY_END) - p2.boardSince;
        boardMin += w; boardCount++; longestBoard = Math.max(longestBoard, w);
      }
    });
    var freeTimes = dis.map(function (x) { return x.tBedFree != null ? x.tBedFree : DAY_END; });
    var avgBedFree = freeTimes.length ? freeTimes.reduce(function (a, c2) { return a + c2; }, 0) / freeTimes.length : null;
    var homeHours = dis.filter(function (x) { return x.tHome != null && x.tOrd != null; })
      .map(function (x) { return (x.tHome - x.tOrd) / 60; });
    var putOff = planned.filter(function (x) { return x.status === 'putoff' || x.status === 'waiting'; }).length;
    var bedCancels = cancelled.filter(function (x) { return x.reason === 'bed'; }).length;

    var demand = [];
    stepDowns.forEach(function (s2, n2) { demand.push({ t: s2.ready, kind: 'sd', n: n2 + 1 }); });
    edAll.forEach(function (p3) { if (p3.boardSince != null) demand.push({ t: p3.boardSince, kind: 'ed' }); });
    planned.forEach(function (p4) { demand.push({ t: p4.arr, kind: 'plan' }); });
    demand.sort(function (a, c3) { return a.t - c3.t; });

    var W = C.weights;
    var metrics = {
      cancelled: cancelled, cancelCount: cancelled.length, bedCancels: bedCancels,
      boardHours: boardMin / 60, boardCount: boardCount, longestBoard: longestBoard,
      blockedHours: sdBlockedMin / 60,
      avgBedFree: avgBedFree, putOff: putOff,
      dischargeHours: homeHours.length ? homeHours.reduce(function (a, c4) { return a + c4; }, 0) / homeHours.length : null,
      leftToday: dis.filter(function (x) { return x.leftBed != null; }).length,
      firstJam: firstJam
    };
    metrics.cost = W.cancel * metrics.cancelCount + W.board * metrics.boardHours + W.blocked * metrics.blockedHours + W.putOff * putOff;

    return { snaps: snaps, events: events, metrics: metrics, dis: dis, demand: demand,
      cases: theatres.map(function (th4) { return th4.cases; }), config: C, now: now };
  }

  /* Run the same plan over several versions of the day. */
  function risk(cfg, opts, n) {
    n = n || 20;
    var hit = 0, board = 0, cancels = 0, cost = 0;
    for (var i = 0; i < n; i++) {
      var o = {}; for (var k in opts) o[k] = opts[k];
      o.seed = (opts.seed || 'day-1') + '#' + i;
      var r = simulate(cfg, o).metrics;
      if (r.cancelCount > 0) hit++;
      board += r.boardHours; cancels += r.cancelCount; cost += r.cost;
    }
    return { runs: n, daysWithCancel: hit, boardHours: board / n, cancels: cancels / n, cost: cost / n };
  }

  /* Try every combination of up to three fixes and keep the cheapest plan that is
     within 4% of the best score. onTest is called for every plan tried. */
  function findBestPlan(cfg, opts, onTest) {
    var ids = FIXES.map(function (f) { return f.id; });
    var combos = [[]];
    for (var a = 0; a < ids.length; a++) {
      combos.push([ids[a]]);
      for (var b = a + 1; b < ids.length; b++) {
        combos.push([ids[a], ids[b]]);
        for (var c = b + 1; c < ids.length; c++) combos.push([ids[a], ids[b], ids[c]]);
      }
    }
    var results = combos.map(function (set) {
      var o = {}; for (var k in opts) o[k] = opts[k];
      o.fixes = {}; set.forEach(function (id) { o.fixes[id] = true; });
      var r = risk(cfg, o, 8);
      var res = { fixes: set, cost: r.cost, cancels: r.cancels, boardHours: r.boardHours, daysWithCancel: r.daysWithCancel, runs: r.runs };
      if (onTest) onTest(res);
      return res;
    });
    var best = results.reduce(function (m, r) { return r.cost < m.cost ? r : m; }, results[0]);
    var pick = results.filter(function (r) { return r.cost <= best.cost * 1.04 + 0.5; })
      .sort(function (x, y) { return x.fixes.length - y.fixes.length || x.cost - y.cost; })[0];
    return { fixes: pick.fixes, tested: results.length, results: results, baseline: results[0], chosen: pick };
  }

  function fmt(t) {
    if (t == null) return '';
    t = Math.round(t);
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  var api = { simulate: simulate, risk: risk, findBestPlan: findBestPlan, FIXES: FIXES, DEFAULTS: DEFAULTS,
    DAY_START: DAY_START, DAY_END: DAY_END, SNAP: SNAP, fmt: fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NabzEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
