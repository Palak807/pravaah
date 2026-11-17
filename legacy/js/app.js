/* Nabz demo app: four screens driven by one state object. */
(function () {
  'use strict';
  var E = NabzEngine, A = NabzAssistant;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var f = E.fmt;

  var NAMES = ['Sunita Rao', 'Imran Sheikh', 'Kavita Nair', 'Harish Gupta', 'Meena Joshi', 'Arvind Pillai', 'Farah Ali', 'Deepak Verma', 'Lata Menon',
    'Rohit Bansal', 'Anjali Desai', 'Suresh Yadav', 'Nazia Khan', 'Vikram Shetty', 'Pooja Saxena', 'Mohan Das', 'Geeta Bhatt', 'Karan Malhotra',
    'Shanti Devi', 'Ajay Kulkarni', 'Rekha Sinha', 'Naveen Reddy', 'Asha Thomas', 'Prakash Jain', 'Seema Chawla', 'Tarun Bose', 'Usha Rani',
    'Manoj Tiwari', 'Divya Kapoor', 'Ramesh Patil', 'Zoya Mirza', 'Gopal Iyer', 'Nisha Arora', 'Sanjay Dubey', 'Bharti Soni', 'Yusuf Pathan'];
  var DOCS = ['Dr. Mehta', 'Dr. Iyer', 'Dr. Khan'];
  var STEPS = ['Registers', 'Check', 'Today', 'Discharge list'];

  var S = { step: 1, maxStep: 1, slots: [null, null, null], reading: false, readDone: false, found: [[], [], []],
    cfg: null, flagYes: true, seed: 'day-2', now: 510, fixes: {}, done: {}, shocks: [], view: 'base', viewT: 510,
    playing: null, tab: 'ask', chat: [], listLang: 'en', status: '', sel: null, base: null, plan: null, hasPlan: false };

  var sample = E.simulate(A.read(), { seed: S.seed });
  var nameMap = {};
  (function () {
    var n = 0;
    sample.snaps[0].ward.forEach(function (b) { if (b.pid) nameMap[b.pid] = NAMES[n++ % NAMES.length]; });
    sample.snaps[0].icu.forEach(function (b) { if (b.pid) nameMap[b.pid] = NAMES[n++ % NAMES.length]; });
  })();
  function nameOf(pid) {
    if (!pid) return '';
    if (nameMap[pid]) return nameMap[pid];
    if (pid[0] === 'E' || pid[0] === 'X') return 'Emergency patient';
    if (pid[0] === 'P') return 'Planned admission';
    return 'Patient';
  }
  function docOf(pid) { return DOCS[parseInt(pid.slice(1), 10) % DOCS.length]; }

  function cfg() {
    var c = {}; for (var k in S.cfg) c[k] = S.cfg[k];
    if (!S.flagYes) { c.fitForDischarge = Math.max(0, c.fitForDischarge - 1); }
    c.insured = Math.min(c.insured, c.fitForDischarge);
    c.wardOccupied = Math.min(c.wardOccupied, c.wardBeds);
    return c;
  }
  function opts(extra) {
    var o = { seed: S.seed, now: S.now, shocks: S.shocks }, k;
    for (k in (extra || {})) o[k] = extra[k];
    return o;
  }
  function toObj(ids) { var o = {}; ids.forEach(function (i) { o[i] = true; }); return o; }
  function anyDone() { for (var k in S.done) for (var j in S.done[k]) if (S.done[k][j]) return true; return false; }
  function compute() {
    S.base = E.simulate(cfg(), opts());
    S.hasPlan = Object.keys(S.fixes).length > 0 || anyDone();
    S.plan = S.hasPlan ? E.simulate(cfg(), opts({ fixes: S.fixes, done: S.done })) : S.base;
    S.riskBase = E.risk(cfg(), opts(), 20);
    S.riskPlan = S.hasPlan ? E.risk(cfg(), opts({ fixes: S.fixes, done: S.done }), 20) : S.riskBase;
    if (!S.hasPlan) S.view = 'base';
  }
  function cur() { return S.view === 'plan' && S.hasPlan ? S.plan : S.base; }
  function snapAt(r, t) { return r.snaps[Math.max(0, Math.min(r.snaps.length - 1, Math.round((t - E.DAY_START) / E.SNAP)))]; }

  /* ---------------- header ---------------- */
  function renderSteps() {
    $('steps').innerHTML = STEPS.map(function (s, i) {
      var n = i + 1;
      return '<button data-act="step" data-n="' + n + '"' + (n === S.step ? ' aria-current="step"' : '') + (n > S.maxStep ? ' disabled' : '') +
        (n < S.step ? ' class="done"' : '') + '><i>' + n + '</i><span>' + s + '</span></button>';
    }).join('');
  }
  function go(n) { S.step = n; S.maxStep = Math.max(S.maxStep, n); stopPlay(); render(); window.scrollTo(0, 0); }

  /* ---------------- registers ---------------- */
  function paper(i, hit) {
    var s0 = sample.snaps[0], h = hit ? ' class="hit"' : '';
    var dis = {}; sample.dis.forEach(function (d) { dis[d.id] = d; });
    var flagBed = sample.dis[sample.dis.length - 1].bed;
    if (i === 0) {
      var rows = s0.ward.map(function (b) {
        var rem = 'cont.', cls = '';
        if (b.kind === 'ready') { rem = b.n === flagBed ? 'fit f. d/c ~?' : (dis[b.pid].insured ? 'fit for d/c, TPA' : 'छुट्टी, cash'); cls = h; }
        else if (b.kind === 'surg') rem = 'OT today';
        else rem = ['cont.', 'obs.', 'Day 2', 'Day 4'][b.n % 4];
        return '<tr' + cls + '><td class="b">' + b.n + '</td><td>' + esc(nameOf(b.pid).split(' ')[0]) + '</td><td' + (b.kind === 'ready' ? ' class="red"' : '') + '>' + rem + '</td></tr>';
      });
      var half = Math.ceil(rows.length / 2);
      return '<div class="paper"><h4>General ward, bed register 15/11</h4><div class="two"><table>' + rows.slice(0, half).join('') + '</table><table>' + rows.slice(half).join('') + '</table></div></div>';
    }
    if (i === 1) {
      return '<div class="paper"><h4>OT list, Sunday 15/11</h4>' + sample.cases.map(function (list, ti) {
        return '<div class="sub" style="margin-top:' + (ti ? 26 : 0) + 'px">Theatre ' + (ti + 1) + '</div><table>' + list.map(function (c) {
          return '<tr' + (c.icu ? h : '') + '><td class="b" style="width:52px">' + f(c.planned) + '</td><td>' + esc(c.name) + '</td><td class="red">' + (c.icu ? 'ICU bed reqd' : '') + '</td></tr>';
        }).join('') + '</table>';
      }).join('') + '</div>';
    }
    return '<div class="paper"><h4>ICU board</h4><table>' + s0.icu.map(function (b) {
      return '<tr><td class="b">' + b.n + '</td><td>' + esc(nameOf(b.pid).split(' ')[0]) + '</td><td>cont.</td></tr>';
    }).map(function (row, ix) {
      var t = ix === 1 ? '10:00' : (ix === 4 ? '10:45' : null);
      return t ? row.replace('<tr>', '<tr' + h + '>').replace('<td>cont.</td>', '<td class="red">ward ke liye ready ' + t + '</td>') : row;
    }).join('') + '</table><div class="sub">Admissions today (kal ki OT)</div><table>' +
      A.read().plannedAdmissions.map(function (t, k) { return '<tr' + h + '><td class="b" style="width:52px">' + f(t) + '</td><td>' + esc(NAMES[30 + k].split(' ')[0]) + '</td><td>ward bed</td></tr>'; }).join('') + '</table></div>';
  }
  var SLOT = ['Bed register', 'Theatre list', 'ICU board and admissions'];
  function renderRegisters() {
    var all = S.slots.every(function (x) { return x; });
    var html = '<section class="intro"><h1>Good morning. Show me today\'s registers.</h1>' +
      '<p class="lede">Photograph the three pages you already keep on paper. Nabz reads them, forecasts where beds will jam today, and tells you what to do first.</p>' +
      '<div class="intro-actions">' +
      (S.readDone ? '<button class="btn primary" data-act="tocheck">Check what I read</button>'
        : (all ? '<button class="btn primary" data-act="read"' + (S.reading ? ' disabled' : '') + '>' + (S.reading ? 'Reading the registers' : 'Read these registers') + '</button>' : '')) +
      (S.reading || S.readDone ? '' : '<button class="btn" data-act="sample">Use the sample registers</button>') +
      '</div></section><div class="papers">';
    for (var i = 0; i < 3; i++) {
      var v = S.slots[i];
      html += '<div class="paper-wrap" id="pw' + i + '">';
      if (!v) {
        html += '<div class="slot"><div><h3>' + SLOT[i] + '</h3><p>No photo yet</p><label class="btn small">Take or choose a photo<input type="file" accept="image/*" capture="environment" data-slot="' + i + '"></label></div></div>';
      } else if (v === 'sample') {
        html += paper(i, S.found[i].length > 0);
      } else {
        html += '<div class="slot" style="border-style:solid"><img alt="Your photo of the ' + SLOT[i].toLowerCase() + '" src="' + v + '"></div>';
      }
      html += '<ul class="found" aria-live="polite">' + S.found[i].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
    }
    html += '</div>';
    if (S.slots.some(function (x) { return x && x !== 'sample'; })) html += '<p class="lede">Demo build: your photos are shown, but the values come from the sample registers.</p>';
    $('view').innerHTML = html;
  }
  var FOUND = [['24 beds, all occupied', '9 patients marked fit to go home', '6 of them insured, 3 paying cash'],
    ['7 surgeries in 2 theatres', '2 need an ICU bed afterwards'],
    ['6 ICU beds, all occupied', '2 ICU patients ready for the ward', '5 admissions due this afternoon']];
  function startReading() {
    S.reading = true; S.found = [[], [], []]; renderRegisters();
    var quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var i = 0;
    (function next() {
      if (i === 3) { S.reading = false; S.readDone = true; S.cfg = A.read(); renderRegisters(); return; }
      var w = $('pw' + i), target = w.firstElementChild;
      if (!quick) { var sc = document.createElement('div'); sc.className = 'scan'; target.appendChild(sc); }
      setTimeout(function () { S.found[i] = FOUND[i]; i++; renderRegisters(); next(); }, quick ? 10 : 1500);
    })();
  }

  /* ---------------- check ---------------- */
  function stepRow(label, hint, key, min, max) {
    return '<div class="readrow"><div>' + label + '<small>' + hint + '</small></div><div class="stepper">' +
      '<button data-act="dec" data-k="' + key + '" data-min="' + min + '" aria-label="One fewer: ' + label + '">−</button>' +
      '<span class="num">' + S.cfg[key] + '</span>' +
      '<button data-act="inc" data-k="' + key + '" data-max="' + max + '" aria-label="One more: ' + label + '">+</button></div></div>';
  }
  function fixedRow(label, hint, val) { return '<div class="readrow fixed"><div>' + label + '<small>' + hint + '</small></div><span class="num">' + val + '</span></div>'; }
  function renderCheck() {
    var flagBed = sample.dis[sample.dis.length - 1].bed;
    $('view').innerHTML = '<div class="check"><section><h1>Here is what I read. Is it right?</h1>' +
      '<p class="lede">Change anything I got wrong. The forecast uses these numbers, so a wrong bed count means a wrong forecast.</p>' +
      '<div class="papers mini" style="margin-top:22px">' + [0, 1, 2].map(function (i) { return '<div class="paper-wrap">' + paper(i, true) + '</div>'; }).join('') + '</div>' +
      '</section><section><div class="readlist">' +
      stepRow('Ward beds', 'From the bed register', 'wardBeds', 16, 32) +
      stepRow('Ward beds occupied this morning', 'From the bed register', 'wardOccupied', 10, S.cfg.wardBeds) +
      stepRow('Patients fit to go home today', 'Rows marked "fit for d/c" or "छुट्टी"', 'fitForDischarge', 0, 12) +
      stepRow('Of those, insured', 'Rows marked "TPA". Insured discharges take longer.', 'insured', 0, S.cfg.fitForDischarge) +
      fixedRow('Surgeries today', '2 of them need an ICU bed afterwards. From the theatre list.', 7) +
      fixedRow('ICU beds, all occupied', '2 patients are ready for the ward, at 10:00 and 10:45. From the ICU board.', S.cfg.icuBeds) +
      fixedRow('Admissions due this afternoon', 'Between 13:35 and 16:15. From the ICU board page.', S.cfg.plannedAdmissions.length) +
      '<div class="readrow ask"><div><b>One row was hard to read.</b> Bed ' + flagBed + ', ' + esc(nameOf(sample.dis[sample.dis.length - 1].id)) +
      ': I read the remark as "fit for discharge" and counted it. Is that right?' +
      '<div class="choice"><button class="btn small" data-act="flag" data-v="1" aria-pressed="' + S.flagYes + '">Yes, fit to go home</button>' +
      '<button class="btn small" data-act="flag" data-v="0" aria-pressed="' + !S.flagYes + '">No, staying today</button></div></div></div>' +
      '</div><div class="intro-actions"><button class="btn primary" data-act="forecast">Looks right. Forecast today</button></div></section></div>';
  }

  /* ---------------- forecast ---------------- */
  var LV = ['Calm', 'Strained', 'Jammed'];
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function hrs(x) { return (Math.round(x * 10) / 10).toString(); }
  function casesText(m) { return m.cancelled.map(function (c) { return c.name + ' (' + f(c.at) + ')'; }).join(' and '); }

  function renderHeadline() {
    var planView = S.view === 'plan' && S.hasPlan, m = cur().metrics, b = S.base.metrics, rk = planView ? S.riskPlan : S.riskBase;
    var fit = S.base.dis.length, h, p;
    if (!planView) {
      if (m.cancelCount) {
        h = 'If nothing changes, ' + plural(m.cancelCount, 'surgery', 'surgeries') + ' will be cancelled today.';
        p = casesText(m) + (m.cancelCount > 1 ? ' each need' : ' needs') + ' an ICU bed afterwards. The ICU cannot free one because the ward is full, and the ward is full because ' +
          fit + ' patients who are fit to go home are still in their beds.';
      } else if (m.boardHours > 3) {
        h = 'No surgery is cancelled, but emergency patients wait ' + hrs(m.boardHours) + ' hours for beds.';
        p = 'Beds from today\'s discharges come free around ' + f(m.avgBedFree) + ', after the patients who need them have arrived.';
      } else { h = 'Today looks manageable. No surgery is cancelled.'; p = 'Beds come free around ' + f(m.avgBedFree) + '.'; }
    } else {
      var saved = b.cancelCount - m.cancelCount, earlier = Math.round(b.avgBedFree - m.avgBedFree);
      h = m.cancelCount === 0 ? 'With this plan, no surgery is cancelled.' : 'With this plan, ' + plural(m.cancelCount, 'surgery is', 'surgeries are') + ' still cancelled.';
      p = (saved > 0 ? plural(saved, 'surgery goes', 'surgeries go') + ' ahead that would have been cancelled. ' : '') +
        (earlier > 5 ? 'Beds come free at ' + f(m.avgBedFree) + ' on average, ' + Math.floor(earlier / 60) + ' h ' + (earlier % 60) + ' min earlier.' : 'Beds come free at about the same time.');
    }
    $('headline').className = 'headline' + (planView ? ' plan' : '');
    $('headline').innerHTML = '<h1>' + h + '</h1><p>' + p + '</p><p class="riskline">In ' + rk.daysWithCancel + ' of ' + rk.runs + ' simulated versions of today, a surgery is cancelled.</p>';
  }
  function renderViewbar() {
    var future = S.viewT > S.now;
    $('viewbar').innerHTML = '<button class="play" data-act="play" aria-label="' + (S.playing ? 'Pause' : 'Play the day forward') + '">' + (S.playing ? '❚❚' : '▶') + '</button>' +
      '<span class="num clock" id="clock">' + f(S.viewT) + '</span><div class="seg" role="group" aria-label="Which day to show">' +
      '<button data-act="view" data-v="base" aria-pressed="' + (S.view === 'base') + '">As things stand</button>' +
      '<button class="fut" data-act="view" data-v="plan" aria-pressed="' + (S.view === 'plan') + '"' + (S.hasPlan ? '' : ' disabled title="Test a plan first"') + '>With plan</button></div>' +
      (future ? '<span class="chip">Showing the forecast for ' + f(S.viewT) + '</span>' : '<span class="chip" style="background:#fff;color:var(--ink)">Showing now, ' + f(S.now) + '</span>') +
      S.shocks.map(function (s, i) { return '<span class="chip shock">Added to today: ' + A.SHOCK_WORDS[s.type].en + (s.type === 'accident' ? f(s.at) : '') + ' <button data-act="unshock" data-i="' + i + '">remove</button></span>'; }).join('');
  }
  function deptLine(k, s) {
    var n = s.n, cancelledSoFar = 0, heldName = null;
    s.th.forEach(function (l) { l.forEach(function (c) { if (c.status === 'cancelled') cancelledSoFar++; if (c.status === 'held') heldName = c.name; }); });
    if (k === 'ed') return n.board ? plural(n.board, 'patient waiting', 'patients waiting') + ' for a ward bed' : n.busyBays + ' of ' + s.ed.length + ' bays in use';
    if (k === 'icu') return n.sd ? plural(n.sd, 'patient ready', 'patients ready') + ' for the ward, no bed to move to' : (n.icuFree ? n.icuFree + ' free' : 'No free bed');
    if (k === 'ward') return n.free === 0 ? '0 free' + (n.board + n.sd + n.plan ? ', ' + (n.board + n.sd + n.plan) + ' waiting for a bed' : '') : n.free + ' free';
    if (k === 'th') return heldName ? heldName + ' held, no ICU bed for afterwards' : (cancelledSoFar ? plural(cancelledSoFar, 'surgery', 'surgeries') + ' cancelled' : 'Running to plan');
    return n.stillInBed ? n.stillInBed + ' fit to go home, still in bed' + (n.notOrdered ? ', ' + n.notOrdered + ' with no discharge order yet' : '') : 'Everyone fit to go has left their bed';
  }
  function renderChain() {
    var s = snapAt(cur(), S.viewT), fit = cur().dis.length;
    var links = [['dis', 'Discharge', s.n.stillInBed + ' of ' + fit + ' fit to go home are still in bed'],
      ['ward', 'Ward', deptLine('ward', s)], ['icu', 'Intensive care', deptLine('icu', s)], ['th', 'Theatres', deptLine('th', s)]];
    $('chain').innerHTML = links.map(function (l) { return '<div class="link l' + s.lv[l[0]] + '"><b>' + l[1] + '</b><span>' + l[2] + '</span></div>'; }).join('');
  }
  var STAGE = { wait: 'no order', sumQ: 'summary', sum: 'summary', billQ: 'bill', bill: 'bill', billed: 'bill', appr: 'insurer', pack: 'leaving' };
  function bedBtn(room, b, cls, word) {
    var key = room + b.n;
    return '<button class="bed ' + cls + (S.sel === key ? ' sel' : '') + '" data-act="bed" data-key="' + key + '" aria-label="' + room + ' ' + b.n + ', ' + (word || 'occupied') + '"><i>' + b.n + '</i><em>' + (word || '') + '</em></button>';
  }
  function room(cls, k, title, s, body) {
    return '<div class="room ' + cls + ' l' + s.lv[k] + '"><header><h3>' + title + '</h3><span class="state">' + LV[s.lv[k]] + '</span><p>' + deptLine(k, s) + '</p></header>' + body + '</div>';
  }
  function renderFloor() {
    var s = snapAt(cur(), S.viewT);
    var ward = s.ward.map(function (b) {
      if (b.st === 'free') return bedBtn('Bed', b, 'b-free', 'free');
      if (b.st === 'dirty') return bedBtn('Bed', b, 'b-dirty', 'to clean');
      if (b.st === 'clean') return bedBtn('Bed', b, 'b-clean', 'cleaning');
      if (b.kind === 'ready') return bedBtn('Bed', b, 'b-ready', STAGE[b.stage] || 'fit');
      if (b.kind === 'surg') return bedBtn('Bed', b, 'b-surg', 'surgery');
      if (b.kind === 'new') return bedBtn('Bed', b, 'b-new', 'new');
      return bedBtn('Bed', b, 'b-occ', '');
    }).join('');
    var icu = s.icu.map(function (b) {
      if (b.st === 'free') return bedBtn('ICU', b, 'b-free', 'free');
      if (b.st === 'clean') return bedBtn('ICU', b, 'b-clean', 'cleaning');
      if (b.st === 'res') return bedBtn('ICU', b, 'b-res', 'held');
      if (b.blocked != null) return bedBtn('ICU', b, 'b-jam', 'stuck');
      if (b.kind === 'postop') return bedBtn('ICU', b, 'b-new', 'post-op');
      return bedBtn('ICU', b, 'b-occ', '');
    }).join('');
    var ed = s.ed.map(function (p, i) {
      var b = { n: i + 1 };
      if (!p) return bedBtn('Bay', b, 'b-free', 'free');
      if (p.board != null) return bedBtn('Bay', b, 'b-jam', p.board + ' min');
      return bedBtn('Bay', b, 'b-treat', '');
    }).join('');
    var th = s.th.map(function (list, ti) {
      return '<div><h4>Theatre ' + (ti + 1) + '</h4>' + list.map(function (c) {
        var w = { waiting: f(c.planned) + ' planned', running: 'In theatre since ' + f(c.startT), done: 'Done ' + f(c.endT),
          held: 'Held ' + c.hold + ' min, no ICU bed', cancelled: 'Cancelled ' + f(c.cancelT) }[c.status];
        return '<div class="case ' + c.status + '"><b>' + esc(c.name) + '</b>' + w + (c.icu && c.status === 'waiting' ? ', needs ICU bed after' : '') + '</div>';
      }).join('') + '</div>';
    }).join('');
    var open = !!(cur() === S.plan && S.fixes.lounge), seats = '';
    for (var i = 0; i < 6; i++) seats += '<span class="seat' + (i < s.lounge ? ' on' : '') + '"></span>';
    $('floor').innerHTML =
      room('r-ed', 'ed', 'Emergency', s, '<div class="beds">' + ed + '</div>' + (s.edQueue ? '<p class="detail">' + s.edQueue + ' waiting for a bay</p>' : '')) +
      room('r-icu', 'icu', 'Intensive care', s, '<div class="beds">' + icu + '</div>') +
      room('r-th', 'th', 'Theatres', s, '<div class="theatres">' + th + '</div>') +
      room('r-ward', 'ward', 'Ward', s, '<div class="beds" style="grid-template-columns:repeat(8,1fr)">' + ward + '</div>') +
      '<div class="room r-lounge l' + s.lv.dis + '"><header><h3>Discharge</h3><span class="state">' + LV[s.lv.dis] + '</span><p>' + deptLine('dis', s) + '</p></header>' +
      (open ? '<div class="seats" aria-hidden="true">' + seats + '</div>' : '') + '<p class="detail">' + (open ? 'Lounge open: ' + s.lounge + ' waiting here for insurer approval' : 'Discharge lounge not open') + '. ' + s.gone + ' of ' + cur().dis.length + ' have left their bed.</p></div>';
    renderDetail();
  }
  function renderDetail() {
    var el = $('detail'); if (!el) return;
    if (!S.sel) { el.textContent = 'Select any bed to see who is in it and what they are waiting for.'; return; }
    var s = snapAt(cur(), S.viewT), m = S.sel.match(/^(Bed|ICU|Bay)(\d+)$/), n = parseInt(m[2], 10), t = '';
    if (m[1] === 'Bed') {
      var b = s.ward[n - 1];
      var words = { wait: 'fit to go home. Waiting for ' + (b.pid ? docOf(b.pid) : 'the doctor') + ' to write the discharge order.', sumQ: 'fit to go home. Waiting for the discharge summary.', sum: 'fit to go home. Discharge summary is being written.',
        billQ: 'fit to go home. Waiting for the final bill.', bill: 'fit to go home. Final bill is being prepared.', appr: 'bill closed. Waiting in bed for the insurer to approve.', pack: 'cleared to go. Packing to leave.' };
      if (b.st === 'free') t = 'Free.'; else if (b.st === 'dirty') t = 'Empty, waiting to be cleaned.'; else if (b.st === 'clean') t = 'Being cleaned.';
      else if (b.kind === 'ready') t = nameOf(b.pid) + ': ' + words[b.stage];
      else if (b.kind === 'surg') t = nameOf(b.pid) + ': having surgery today.';
      else if (b.kind === 'new') t = nameOf(b.pid) + ': ' + (b.pid[0] === 'I' ? 'moved here from intensive care today.' : (b.pid[0] === 'P' ? 'planned admission, arrived today.' : 'admitted from emergency today.'));
      else t = nameOf(b.pid) + ': staying today.';
      t = 'Bed ' + n + '. ' + t;
    } else if (m[1] === 'ICU') {
      var c = s.icu[n - 1];
      t = 'ICU bed ' + n + '. ' + (c.st === 'free' ? 'Free.' : c.st === 'clean' ? 'Being cleaned.' : c.st === 'res' ? 'Held for a patient who is in surgery.' :
        c.blocked != null ? nameOf(c.pid) + ': ready for the ward for ' + c.blocked + ' min. No ward bed is free.' : (c.kind === 'postop' ? 'Patient recovering after surgery.' : nameOf(c.pid) + ': staying in intensive care.'));
    } else {
      var p = s.ed[n - 1];
      t = 'Emergency bay ' + n + '. ' + (!p ? 'Free.' : p.board != null ? 'Admitted, but stuck here for ' + p.board + ' min. No ward bed is free.' : 'Being treated.');
    }
    el.textContent = t;
  }
  var ROWS = [['ed', 'Emergency'], ['icu', 'Intensive care'], ['ward', 'Ward'], ['th', 'Theatres'], ['dis', 'Discharge']];
  function renderTime() {
    var r = cur(), html = '<div class="timehead"><span>Drag to move through the day, or press play above to watch it unfold. It is ' + f(S.now) + ' now.</span></div><div class="strip">';
    ROWS.forEach(function (row) {
      html += '<label>' + row[1] + '</label><div class="cells">';
      for (var i = 0; i < r.snaps.length - 1; i += 3) {
        var lv = Math.max(r.snaps[i].lv[row[0]], r.snaps[i + 1].lv[row[0]], r.snaps[i + 2].lv[row[0]]);
        html += '<i class="c' + lv + '"></i>';
      }
      html += '</div>';
    });
    html += '<div class="track"><div class="cursor" id="cursor"></div></div><span></span><div class="hours">';
    for (var hr = 8; hr <= 21; hr++) html += '<span>' + (hr < 10 ? '0' : '') + hr + '</span>';
    html += '</div><span></span><input type="range" id="scrub" min="' + E.DAY_START + '" max="' + E.DAY_END + '" step="5" value="' + S.viewT + '" aria-label="Time of day to show"></div>';
    $('timebox').innerHTML = html; moveCursor();
  }
  function moveCursor() {
    var c = $('cursor'); if (!c) return;
    c.style.left = ((S.viewT - E.DAY_START) / (E.DAY_END - E.DAY_START) * 100) + '%';
    c.className = 'cursor' + (S.viewT > S.now ? ' fut' : '');
    if ($('clock')) $('clock').textContent = f(S.viewT);
  }
  function diffWord(a, b, unit, lowerBetter) {
    var d = Math.round((b - a) * 10) / 10;
    if (Math.abs(d) < 0.05) return 'no change';
    return (d < 0 ? 'down ' : 'up ') + Math.abs(d) + (unit || '');
  }
  function renderNumbers() {
    var b = S.base.metrics, p = S.plan.metrics, hp = S.hasPlan;
    function row(label, bv, pv, dw) {
      return '<tr><td>' + label + '</td><td><span class="num">' + bv + '</span></td><td class="p">' + (hp ? '<span class="num">' + pv + '</span><small>' + dw + '</small>' : '<small>Test a plan to compare</small>') + '</td></tr>';
    }
    var early = Math.round(b.avgBedFree - p.avgBedFree);
    $('numbers').innerHTML = '<thead><tr><th>By 21:00 tonight</th><th>As things stand</th><th>With plan</th></tr></thead><tbody>' +
      row('Surgeries cancelled', b.cancelCount, p.cancelCount, diffWord(b.cancelCount, p.cancelCount)) +
      row('Hours emergency patients wait for a ward bed', hrs(b.boardHours), hrs(p.boardHours), diffWord(b.boardHours, p.boardHours)) +
      row('Hours ICU patients are stuck waiting for a ward bed', hrs(b.blockedHours), hrs(p.blockedHours), diffWord(b.blockedHours, p.blockedHours)) +
      row('Average time a bed comes free', f(b.avgBedFree), f(p.avgBedFree), Math.abs(early) < 5 ? 'no change' : Math.floor(Math.abs(early) / 60) + ' h ' + (Math.abs(early) % 60) + ' min ' + (early > 0 ? 'earlier' : 'later')) +
      row('Planned admissions put off to tomorrow', b.putOff, p.putOff, diffWord(b.putOff, p.putOff)) + '</tbody>';
  }
  var TRIES = ['ICU kab full hoga?', 'What should we do today?', 'अगर डिस्चार्ज राउंड सुबह कर दें तो?', 'What if a road accident brings 6 patients at 11?'];
  function renderSide() {
    var html = '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="ask" aria-selected="' + (S.tab === 'ask') + '">Ask Nabz</button>' +
      '<button role="tab" data-act="tab" data-v="plan" aria-selected="' + (S.tab === 'plan') + '">Test a plan</button></div><div class="pane">';
    if (S.tab === 'ask') {
      html += '<div class="msgs" id="msgs">' + (S.chat.length ? '' : '<div class="msg a">Ask me about today in English, Hindi or Hinglish. I run your question on the twin before I answer.</div>') +
        S.chat.map(function (m, i) {
          if (m.who === 'u') return '<div class="msg u">' + esc(m.text) + '</div>';
          var tests = m.tests.slice(0, m.shown);
          return '<div class="msg a">' + (tests.length ? '<ul class="tests">' + tests.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
            (m.ready ? esc(m.text) + (m.plan && m.plan.length ? '<br><button class="btn small future" data-act="useplan" data-i="' + i + '">Show this plan on the floor</button>' : '') : '<i>Running it on the twin</i>') + '</div>';
        }).join('') + '</div><div class="tries">' + TRIES.map(function (t) { return '<button data-act="try">' + t + '</button>'; }).join('') + '</div>' +
        '<form class="askbar" id="askform"><input id="askin" autocomplete="off" placeholder="Type a question, in any language" aria-label="Question for Nabz"><button class="btn future">Ask</button></form>';
    } else {
      html += '<p style="margin:0 0 4px">Tick what you could do today. The twin reruns the day at once.</p>' + E.FIXES.map(function (x) {
        return '<label class="fix"><input type="checkbox" data-fix="' + x.id + '"' + (S.fixes[x.id] ? ' checked' : '') + '><b>' + x.name + '</b><small>' + x.what + '</small></label>';
      }).join('') + '<p class="status" aria-live="polite">' + esc(S.status) + '</p><div class="planfoot"><button class="btn future" data-act="best">Find the best plan</button>' +
        '<button class="btn" data-act="clearplan"' + (Object.keys(S.fixes).length ? '' : ' disabled') + '>Clear the plan</button></div>';
    }
    html += '</div><div class="sidefoot"><button class="btn primary" data-act="tolist">Make today\'s discharge list</button></div>';
    $('side').innerHTML = html;
    var ms = $('msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
  }
  function renderForecast() {
    $('view').innerHTML = '<div class="fc"><section><div id="headline"></div><div class="viewbar" id="viewbar"></div><div class="chain" id="chain"></div>' +
      '<div class="floor" id="floor"></div><p class="detail" id="detail" aria-live="polite"></p>' +
      '<div class="legend"><span><i class="bed b-occ"></i>Occupied</span><span><i class="bed b-ready"></i>Fit to go home, still in bed</span><span><i class="bed b-surg"></i>Surgery patient</span>' +
      '<span><i class="bed b-new"></i>Arrived today</span><span><i class="bed b-jam"></i>Stuck waiting for a bed</span><span><i class="bed b-res"></i>Held for a surgery patient</span>' +
      '<span><i class="bed b-clean"></i>To clean</span><span><i class="bed b-free"></i>Free</span></div>' +
      '<div class="timebox" id="timebox"></div><table class="numbers" id="numbers"></table></section><aside class="side" id="side"></aside></div>';
    refreshForecast(true);
  }
  function refreshForecast(all) {
    renderHeadline(); renderViewbar(); renderChain(); renderFloor();
    if (all) { renderTime(); renderNumbers(); renderSide(); } else moveCursor();
  }
  function recompute() { compute(); if (S.step === 3) refreshForecast(true); else if (S.step === 4) renderList(); }
  function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = null; } }
  function play() {
    if (S.playing) { stopPlay(); renderViewbar(); return; }
    if (S.viewT >= E.DAY_END) S.viewT = S.now;
    S.playing = setInterval(function () {
      S.viewT += 5;
      if (S.viewT >= E.DAY_END) { S.viewT = E.DAY_END; stopPlay(); }
      var sc = $('scrub'); if (sc) sc.value = S.viewT;
      refreshForecast(false);
    }, 70);
    renderViewbar();
  }

  function ask(text) {
    text = text.trim(); if (!text) return;
    S.chat.push({ who: 'u', text: text });
    var ctx = { base: S.base, plan: S.plan, hasPlan: S.hasPlan, fixes: S.fixes, cfg: cfg(), now: S.now,
      run: function (ids, extra) { return E.simulate(cfg(), opts({ fixes: toObj(ids || []), shocks: S.shocks.concat(extra || []) })); },
      best: function (cb) { return E.findBestPlan(cfg(), opts(), cb); } };
    var r = A.ask(text, ctx);
    var msg = { who: 'a', tests: r.tests, text: r.text, plan: r.plan, shown: 0, ready: false };
    S.chat.push(msg); renderSide();
    var quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function tickMsg() {
      if (msg.shown < msg.tests.length) { msg.shown++; if (S.step === 3 && S.tab === 'ask') renderSide(); setTimeout(tickMsg, quick ? 0 : 380); return; }
      setTimeout(function () {
        msg.ready = true;
        if (r.shock) { S.shocks.push(r.shock); recompute(); } else if (S.step === 3 && S.tab === 'ask') renderSide();
      }, quick ? 0 : 450);
    })();
  }

  /* ---------------- discharge list ---------------- */
  var L = {
    en: { title: 'Today\'s discharge list', lede: 'In the order the beds should come free. Tick a step when the ward confirms it, and the forecast updates.',
      order: 'Discharge order', summary: 'Discharge summary', bill: 'Final bill', approval: 'Insurer approval',
      duty: 'Duty doctor', billing: 'Billing desk', insdesk: 'Insurance desk', insured: 'insured', cash: 'paying cash', bed: 'Bed',
      sd: function (t, c) { return 'Needed by ' + t + ': an ICU patient is ready for the ward. Moving them frees the ICU bed for ' + c + '.'; },
      ed: function (t) { return 'Needed by ' + t + ': an emergency patient will be waiting for a bed.'; },
      plan: function (t) { return 'Needed by ' + t + ': a planned admission arrives.'; },
      none: 'Keeps a bed ready for evening emergencies.',
      free: function (t) { return 'On the current plan this bed is free at ' + t + '.'; }, late: function (n) { return ' That is ' + n + ' min after it is needed.'; }, ok: ' In time.', never: 'On the current plan this bed is not free before 21:00.',
      actions: 'Agreed for today', effect: 'What this changes', waiting: 'Still waiting on', nothing: 'Nothing. Every step is ticked.',
      m1: 'Surgeries cancelled', m2: 'Hours emergency patients wait for a bed', m3: 'Average time a bed comes free', m4: 'Admissions put off', was: 'was ', print: 'Print the list' },
    hi: { title: 'आज की डिस्चार्ज सूची', lede: 'उसी क्रम में जिसमें बेड खाली होने चाहिए। वार्ड से पुष्टि होते ही स्टेप पर टिक करें, फ़ोरकास्ट अपने आप बदल जाएगा।',
      order: 'डिस्चार्ज ऑर्डर', summary: 'डिस्चार्ज समरी', bill: 'फ़ाइनल बिल', approval: 'बीमा की मंज़ूरी',
      duty: 'ड्यूटी डॉक्टर', billing: 'बिलिंग डेस्क', insdesk: 'बीमा डेस्क', insured: 'बीमा', cash: 'कैश', bed: 'बेड',
      sd: function (t, c) { return t + ' बजे तक चाहिए: आईसीयू का एक मरीज़ वार्ड के लिए तैयार है। उसे शिफ़्ट करने से ' + c + ' के लिए आईसीयू बेड खाली होगा।'; },
      ed: function (t) { return t + ' बजे तक चाहिए: इमरजेंसी का एक मरीज़ बेड का इंतज़ार कर रहा होगा।'; },
      plan: function (t) { return t + ' बजे तक चाहिए: एक मरीज़ भर्ती होने आएगा।'; },
      none: 'शाम की इमरजेंसी के लिए बेड तैयार रहेगा।',
      free: function (t) { return 'मौजूदा प्लान में यह बेड ' + t + ' बजे खाली होगा।'; }, late: function (n) { return ' यह ज़रूरत से ' + n + ' मिनट बाद है।'; }, ok: ' समय पर।', never: 'मौजूदा प्लान में यह बेड 21:00 से पहले खाली नहीं होगा।',
      actions: 'आज के लिए तय', effect: 'इससे क्या बदलता है', waiting: 'अभी किस पर रुका है', nothing: 'कुछ नहीं। सब स्टेप पूरे हैं।',
      m1: 'रद्द सर्जरी', m2: 'इमरजेंसी मरीज़ों का बेड के लिए इंतज़ार (घंटे)', m3: 'बेड खाली होने का औसत समय', m4: 'टाली गई भर्तियाँ', was: 'पहले ', print: 'सूची प्रिंट करें' }
  };
  var STEP_KEYS = ['order', 'summary', 'bill', 'approval'];
  var OWNER_HI = { 'Medical superintendent': 'मेडिकल सुपरिंटेंडेंट', 'Nursing in-charge': 'नर्सिंग इंचार्ज', 'Insurance desk': 'बीमा डेस्क',
    'Housekeeping supervisor': 'हाउसकीपिंग सुपरवाइज़र', 'Theatre in-charge': 'थिएटर इंचार्ज' };
  function listPatients() {
    var ps = S.plan.dis.slice().sort(function (a, b) {
      var x = a.tBedFree == null ? 9999 : a.tBedFree, y = b.tBedFree == null ? 9999 : b.tBedFree;
      return (x - y) || (parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
    });
    var icuCases = []; S.base.cases.forEach(function (l) { l.forEach(function (c) { if (c.icu) icuCases.push(c.name); }); });
    return ps.map(function (p, i) { return { p: p, need: S.base.demand[i] || null, icuCases: icuCases }; });
  }
  function renderList() {
    var t = L[S.listLang], items = listPatients(), b = S.base.metrics, m = S.plan.metrics, pend = {};
    var planDis = {}; S.plan.dis.forEach(function (d) { planDis[d.id] = d; });
    var cards = items.map(function (it, i) {
      var p = it.p, d = S.done[p.id] || {}, keys = STEP_KEYS.filter(function (k) { return k !== 'approval' || p.insured; });
      var clear = keys.every(function (k) { return d[k]; });
      var need = !it.need ? t.none : it.need.kind === 'sd' ? t.sd(f(it.need.t), it.icuCases[it.need.n - 1] || 'surgery') : it.need.kind === 'ed' ? t.ed(f(it.need.t)) : t.plan(f(it.need.t));
      var pf = planDis[p.id].tBedFree;
      var when = pf == null ? t.never : t.free(f(pf)) + (it.need ? (pf > it.need.t + 15 ? t.late(Math.round(pf - it.need.t)) : t.ok) : '');
      var ticks = keys.map(function (k) {
        var owner = k === 'order' ? docOf(p.id) : k === 'summary' ? t.duty : k === 'bill' ? t.billing : t.insdesk;
        if (!d[k]) pend[owner] = (pend[owner] || 0) + 1;
        return '<label class="tick' + (d[k] ? ' on' : '') + '"><input type="checkbox" data-tick="' + p.id + '" data-k="' + k + '"' + (d[k] ? ' checked' : '') + '><span><b>' + t[k] + '</b>' + owner + '</span></label>';
      }).join('');
      return '<div class="card' + (clear ? ' clear' : '') + '"><div class="num rank">' + (i + 1) + '</div><h3>' + t.bed + ' ' + p.bed + ', ' + esc(nameOf(p.id)) + '<small>' + (p.insured ? t.insured : t.cash) + '</small></h3>' +
        '<div class="need">' + need + ' ' + when + '</div><div class="ticks">' + ticks + '</div></div>';
    }).join('');
    var fixIds = Object.keys(S.fixes);
    var actions = fixIds.length ? '<div class="actions"><h3>' + t.actions + '</h3><ul style="margin:0;padding-left:20px">' + E.FIXES.filter(function (x) { return S.fixes[x.id]; }).map(function (x) {
      return '<li><b>' + (S.listLang === 'hi' ? A.FIX_WORDS[x.id].hi : x.name) + '</b>: ' + (S.listLang === 'hi' ? OWNER_HI[x.owner] : x.owner) + '</li>'; }).join('') + '</ul></div>' : '';
    function row(label, bv, pv, better) {
      return '<div class="row"><span>' + label + '</span><span><span class="num ' + (better > 0 ? 'good' : better < 0 ? 'bad' : '') + '">' + pv + '</span><span class="was">' + t.was + bv + '</span></span></div>';
    }
    var owners = Object.keys(pend).sort(function (x, y) { return pend[y] - pend[x]; });
    $('view').innerHTML = '<div class="dl"><section><h1>' + t.title + '</h1><p class="lede">' + t.lede + '</p>' +
      '<div class="dlbar"><div class="seg" role="group" aria-label="Language"><button data-act="lang" data-v="en" aria-pressed="' + (S.listLang === 'en') + '">English</button>' +
      '<button data-act="lang" data-v="hi" aria-pressed="' + (S.listLang === 'hi') + '">हिंदी</button></div><button class="btn small" data-act="print">' + t.print + '</button></div>' +
      actions + cards + '</section><aside class="effect"><h3>' + t.effect + '</h3>' +
      row(t.m1, b.cancelCount, m.cancelCount, b.cancelCount - m.cancelCount) +
      row(t.m2, hrs(b.boardHours), hrs(m.boardHours), b.boardHours - m.boardHours) +
      row(t.m3, f(b.avgBedFree), f(m.avgBedFree), b.avgBedFree - m.avgBedFree) +
      row(t.m4, b.putOff, m.putOff, b.putOff - m.putOff) +
      '<h3 style="margin-top:16px">' + t.waiting + '</h3><ul class="owners">' + (owners.length ? owners.map(function (o) { return '<li><span>' + o + '</span><b>' + pend[o] + '</b></li>'; }).join('') : '<li>' + t.nothing + '</li>') + '</ul>' +
      '<p style="margin:14px 0 0"><button class="btn small" data-act="step" data-n="3">Back to the floor</button></p></aside></div>';
  }

  /* ---------------- routing and events ---------------- */
  function render() {
    renderSteps();
    if (S.step === 1) renderRegisters(); else if (S.step === 2) renderCheck(); else if (S.step === 3) renderForecast(); else renderList();
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.dataset.act, k;
    if (a === 'step') go(parseInt(el.dataset.n, 10));
    else if (a === 'sample') { S.slots = ['sample', 'sample', 'sample']; renderRegisters(); }
    else if (a === 'read') startReading();
    else if (a === 'tocheck') go(2);
    else if (a === 'inc' || a === 'dec') {
      k = el.dataset.k;
      S.cfg[k] = a === 'inc' ? Math.min(parseInt(el.dataset.max, 10), S.cfg[k] + 1) : Math.max(parseInt(el.dataset.min, 10), S.cfg[k] - 1);
      S.cfg.wardOccupied = Math.min(S.cfg.wardOccupied, S.cfg.wardBeds); S.cfg.insured = Math.min(S.cfg.insured, S.cfg.fitForDischarge);
      renderCheck();
    }
    else if (a === 'flag') { S.flagYes = el.dataset.v === '1'; renderCheck(); }
    else if (a === 'forecast') { S.fixes = {}; S.done = {}; S.shocks = []; S.chat = []; S.view = 'base'; S.viewT = S.now; compute(); go(3); }
    else if (a === 'view') { S.view = el.dataset.v; refreshForecast(true); }
    else if (a === 'bed') { S.sel = S.sel === el.dataset.key ? null : el.dataset.key; renderFloor(); }
    else if (a === 'play') play();
    else if (a === 'tab') { S.tab = el.dataset.v; renderSide(); }
    else if (a === 'try') ask(el.textContent);
    else if (a === 'useplan') { S.fixes = toObj(S.chat[parseInt(el.dataset.i, 10)].plan); S.view = 'plan'; S.status = ''; recompute(); }
    else if (a === 'unshock') { S.shocks.splice(parseInt(el.dataset.i, 10), 1); recompute(); }
    else if (a === 'best') {
      var b = E.findBestPlan(cfg(), opts());
      S.fixes = toObj(b.fixes); S.view = 'plan';
      S.status = 'Tested ' + b.tested + ' plans on the twin. Best: ' + (b.fixes.length ? E.FIXES.filter(function (x) { return S.fixes[x.id]; }).map(function (x) { return x.name.toLowerCase(); }).join(', and ') + '.' : 'no change needed.');
      recompute();
    }
    else if (a === 'clearplan') { S.fixes = {}; S.status = ''; recompute(); }
    else if (a === 'tolist') go(4);
    else if (a === 'lang') { S.listLang = el.dataset.v; renderList(); }
    else if (a === 'print') window.print();
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.slot != null && el.files && el.files[0]) {
      var rd = new FileReader(), i = parseInt(el.dataset.slot, 10);
      rd.onload = function () { S.slots[i] = rd.result; renderRegisters(); }; rd.readAsDataURL(el.files[0]);
    } else if (el.dataset.fix) {
      if (el.checked) S.fixes[el.dataset.fix] = true; else delete S.fixes[el.dataset.fix];
      S.view = Object.keys(S.fixes).length ? 'plan' : S.view; S.status = ''; recompute();
    } else if (el.dataset.tick) {
      var id = el.dataset.tick, k = el.dataset.k, ix = STEP_KEYS.indexOf(k), d = S.done[id] || (S.done[id] = {});
      STEP_KEYS.forEach(function (key, j) { if (el.checked ? j <= ix : j >= ix) d[key] = el.checked; });
      S.view = 'plan'; recompute();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'scrub') { stopPlay(); S.viewT = parseInt(e.target.value, 10); refreshForecast(false); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'askform') { e.preventDefault(); var v = $('askin').value; ask(v); }
  });

  render();
})();
