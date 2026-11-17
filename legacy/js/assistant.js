/* Nabz assistant, demo version.
   Two jobs: read() turns register photos into hospital numbers, ask() answers questions.
   In this demo both are scripted: read() returns the sample day, and ask() matches the
   question to an intent. Every number in an answer is computed by the simulation engine.
   To make it real, replace read() and ask() with calls to a Claude endpoint that is given
   the same context object (ctx.run is the test_plan tool). */
(function (root) {
  'use strict';
  var E = root.NabzEngine;

  var FIX_WORDS = {
    earlyRound: { en: 'discharge rounds first thing', hing: 'subah sabse pehle discharge rounds', hi: 'सुबह सबसे पहले डिस्चार्ज राउंड' },
    lounge: { en: 'a discharge lounge', hing: 'discharge lounge', hi: 'डिस्चार्ज लाउंज' },
    prefile: { en: 'sending insurance papers early', hing: 'insurance ke papers jaldi bhejna', hi: 'बीमा के कागज़ जल्दी भेजना' },
    housekeeping: { en: 'a second cleaning team', hing: 'doosri safai team', hi: 'दूसरी सफ़ाई टीम' },
    overtime: { en: 'theatre overtime', hing: 'theatre overtime', hi: 'थिएटर ओवरटाइम' }
  };
  var DEPT = {
    icu: { en: 'Intensive care', hing: 'ICU', hi: 'आईसीयू' },
    th: { en: 'The theatres', hing: 'Theatre', hi: 'थिएटर' },
    ed: { en: 'Emergency', hing: 'Emergency', hi: 'इमरजेंसी' },
    ward: { en: 'The ward', hing: 'Ward', hi: 'वार्ड' },
    dis: { en: 'The discharge desk', hing: 'Discharge desk', hi: 'डिस्चार्ज डेस्क' }
  };

  function lang(text) {
    if (/[ऀ-ॿ]/.test(text)) return 'hi';
    if (/\b(kya|kab|kyun|kyon|kyu|kaise|hoga|hogi|honge|karein|karen|karna|kar|agar|toh|hai|hain|nahi|kitne|kitna|aaj|jaldi|subah|chahiye|batao|kaun|kaunsi|kahan|mein|ko|ke|ki|ka)\b/i.test(text)) return 'hing';
    return 'en';
  }
  function h1(x) { return (Math.round(x * 10) / 10).toString(); }
  function join(list, l) {
    if (list.length < 2) return list.join('');
    var and = l === 'en' ? ' and ' : (l === 'hi' ? ' और ' : ' aur ');
    return list.slice(0, -1).join(', ') + and + list[list.length - 1];
  }
  function fixList(ids, l) { return join(ids.map(function (id) { return FIX_WORDS[id][l]; }), l); }
  function cases(m) { return m.cancelled.map(function (c) { return c.name + ' (' + E.fmt(c.at) + ')'; }); }
  function testLine(ids, m, l) {
    var name = ids.length ? fixList(ids, 'en') : 'no change';
    return name + ': ' + m.cancelCount + ' cancelled, beds free at ' + E.fmt(m.avgBedFree);
  }

  function parseTime(text, fallback) {
    var m = text.match(/(?:\bat|@)\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)?/i) || text.match(/(\d{1,2})(?::(\d\d))?\s*(am|pm|baje|बजे)/i) || text.match(/(\d{1,2}):(\d\d)/);
    if (!m) return fallback;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
    if (/pm/i.test(m[3] || '') && h < 12) h += 12;
    if (h < 8 && !/am/i.test(m[3] || '')) h += 12;
    var t = h * 60 + mi;
    return (t >= E.DAY_START && t < E.DAY_END - 60) ? t : fallback;
  }

  function detect(text) {
    var s = text.toLowerCase();
    if (/accident|durghatna|हादसा|दुर्घटना|एक्सीडेंट|casualt/.test(s)) return { intent: 'shock', shock: 'accident' };
    if (/(insurance|tpa|बीमा|इंश्योरेंस)/.test(s) && /(short|slow|late|kam|कम|chhutti|छुट्टी|absent|staff|स्टाफ|der|देर)/.test(s)) return { intent: 'shock', shock: 'insuranceSlow' };
    if (/(doctor|rounds?|डॉक्टर|राउंड)/.test(s) && /(\blate\b|\bder\b|देर)/.test(s)) return { intent: 'shock', shock: 'roundsLate' };
    if (/lounge|लाउंज/.test(s)) return { intent: 'fix', fix: 'lounge' };
    if (/pre-?fil|papers?|kagaz|कागज/.test(s)) return { intent: 'fix', fix: 'prefile' };
    if (/clean|housekeep|safai|सफाई|सफ़ाई/.test(s)) return { intent: 'fix', fix: 'housekeeping' };
    if (/overtime|ओवरटाइम/.test(s)) return { intent: 'fix', fix: 'overtime' };
    if (/(early|earlier|jaldi|जल्दी|subah|सुबह|pehle|पहले|first thing|morning)/.test(s) && /(round|discharge|छुट्टी|डिस्चार्ज|राउंड)/.test(s)) return { intent: 'fix', fix: 'earlyRound' };
    if (/what should|what (do|can) (i|we) do|best|plan|kya kar|क्या कर|suggest|recommend|upay|उपाय|how (do|can) (i|we)|kaise (bacha|rok|thik)|कैसे/.test(s)) return { intent: 'best' };
    if (/why|kyun|kyon|kyu\b|क्यों|reason|wajah|वजह|cause/.test(s)) return { intent: 'why' };
    if (/cancel|कैंसिल|रद्द|surger|operation|ऑपरेशन|सर्जरी/.test(s)) return { intent: 'cancel' };
    if (/khali|खाली|come free|free bed|bed.*free/.test(s)) return { intent: 'beds' };
    if (/when|kab|कब|full|jam|भर|icu|आईसीयू|first/.test(s)) return { intent: 'when' };
    if (/bed|बेड/.test(s)) return { intent: 'beds' };
    return { intent: 'help' };
  }

  var T = {
    when: {
      en: function (v) { return v.jam ? v.dept + ' jams first, at ' + v.t + '. ' + v.sd + ' patients there are ready for the ward, but the ward has no free bed.' + (v.c1 ? ' By ' + v.c1t + ' the ' + v.c1 + ' is cancelled, because that patient needs an ICU bed afterwards.' : '') : 'No department is forecast to jam before 21:00.'; },
      hing: function (v) { return v.jam ? 'Sabse pehle ' + v.dept + ' jam hoga, ' + v.t + ' baje. Wahan ' + v.sd + ' patient ward ke liye ready hain, lekin ward mein koi bed khali nahi hai.' + (v.c1 ? ' ' + v.c1t + ' tak ' + v.c1 + ' cancel ho jayegi, kyunki us patient ko baad mein ICU bed chahiye.' : '') : '21:00 se pehle koi department jam nahi hoga.'; },
      hi: function (v) { return v.jam ? 'सबसे पहले ' + v.dept + ' जाम होगा, ' + v.t + ' बजे। वहाँ ' + v.sd + ' मरीज़ वार्ड में जाने के लिए तैयार हैं, लेकिन वार्ड में कोई बेड खाली नहीं है।' + (v.c1 ? ' ' + v.c1t + ' तक ' + v.c1 + ' रद्द हो जाएगी, क्योंकि उस मरीज़ को बाद में आईसीयू बेड चाहिए।' : '') : '21:00 से पहले कोई विभाग जाम नहीं होगा।'; }
    },
    why: {
      en: function (v) { return 'It starts at the discharge desk. ' + v.fit + ' patients are fit to go home, but their paperwork starts after ' + v.ord + ' and takes about ' + v.dh + ' hours, so beds come free around ' + v.bf + '. Until then the ward is full, ICU patients cannot move out, and surgeries that need an ICU bed are cancelled.'; },
      hing: function (v) { return 'Shuruaat discharge se hoti hai. ' + v.fit + ' patient ghar jaane ke liye fit hain, lekin unka paperwork ' + v.ord + ' ke baad shuru hota hai aur lagbhag ' + v.dh + ' ghante leta hai, isliye bed ' + v.bf + ' ke aaspaas khali hote hain. Tab tak ward full rehta hai, ICU ke patient bahar nahi aa paate, aur jin surgeries ko ICU bed chahiye woh cancel ho jaati hain.'; },
      hi: function (v) { return 'शुरुआत डिस्चार्ज से होती है। ' + v.fit + ' मरीज़ घर जाने के लिए फ़िट हैं, लेकिन उनका पेपरवर्क ' + v.ord + ' के बाद शुरू होता है और लगभग ' + v.dh + ' घंटे लेता है, इसलिए बेड ' + v.bf + ' के आसपास खाली होते हैं। तब तक वार्ड भरा रहता है, आईसीयू के मरीज़ बाहर नहीं आ पाते, और जिन सर्जरी को आईसीयू बेड चाहिए वे रद्द हो जाती हैं।'; }
    },
    best: {
      en: function (v) { return 'I tested ' + v.n + ' plans on the twin. The best one is ' + v.fixes + '. Surgeries cancelled go from ' + v.a + ' to ' + v.b + ', beds come free at ' + v.bf2 + ' instead of ' + v.bf1 + ', and emergency patients wait ' + v.bh2 + ' hours for beds instead of ' + v.bh1 + '. One risk to watch: it only works if the doctors finish rounds before clinic starts.'; },
      hing: function (v) { return 'Maine twin par ' + v.n + ' plan test kiye. Sabse accha plan hai: ' + v.fixes + '. Cancel hone wali surgeries ' + v.a + ' se ' + v.b + ' ho jaati hain, bed ' + v.bf1 + ' ki jagah ' + v.bf2 + ' baje khali hote hain, aur emergency ke patient bed ke liye ' + v.bh1 + ' ki jagah ' + v.bh2 + ' ghante wait karte hain. Ek risk: yeh tabhi chalega jab doctor clinic se pehle rounds poore kar lein.'; },
      hi: function (v) { return 'मैंने ट्विन पर ' + v.n + ' प्लान टेस्ट किए। सबसे अच्छा प्लान है: ' + v.fixes + '। रद्द होने वाली सर्जरी ' + v.a + ' से ' + v.b + ' हो जाती हैं, बेड ' + v.bf1 + ' की जगह ' + v.bf2 + ' बजे खाली होते हैं, और इमरजेंसी के मरीज़ बेड के लिए ' + v.bh1 + ' की जगह ' + v.bh2 + ' घंटे इंतज़ार करते हैं। एक जोखिम: यह तभी चलेगा जब डॉक्टर क्लिनिक से पहले राउंड पूरे कर लें।'; }
    },
    fix: {
      en: function (v) { return 'With ' + v.fix + ', surgeries cancelled ' + (v.a === v.b ? 'stay at ' + v.a : 'go from ' + v.a + ' to ' + v.b) + '. Beds come free at ' + v.bf2 + ' (now ' + v.bf1 + ') and emergency patients wait ' + v.bh2 + ' hours for beds (now ' + v.bh1 + '). ' + (v.b < v.a ? 'That is worth doing.' : 'On its own this does not save the surgeries.'); },
      hing: function (v) { return v.fix.charAt(0).toUpperCase() + v.fix.slice(1) + ' ke saath, cancel hone wali surgeries ' + (v.a === v.b ? v.a + ' hi rehti hain' : v.a + ' se ' + v.b + ' ho jaati hain') + '. Bed ' + v.bf2 + ' baje khali hote hain (abhi ' + v.bf1 + ') aur emergency ke patient ' + v.bh2 + ' ghante wait karte hain (abhi ' + v.bh1 + '). ' + (v.b < v.a ? 'Yeh karna faydemand hai.' : 'Akele isse surgeries nahi bachti.'); },
      hi: function (v) { return v.fix + ' के साथ, रद्द होने वाली सर्जरी ' + (v.a === v.b ? v.a + ' ही रहती हैं' : v.a + ' से ' + v.b + ' हो जाती हैं') + '। बेड ' + v.bf2 + ' बजे खाली होते हैं (अभी ' + v.bf1 + ') और इमरजेंसी के मरीज़ ' + v.bh2 + ' घंटे इंतज़ार करते हैं (अभी ' + v.bh1 + ')। ' + (v.b < v.a ? 'यह करना फ़ायदेमंद है।' : 'अकेले इससे सर्जरी नहीं बचती।'); }
    },
    cancel: {
      en: function (v) { return v.n ? v.n + (v.n > 1 ? ' surgeries are' : ' surgery is') + ' forecast to be cancelled: ' + v.list + '. ' + (v.n > 1 ? 'Each needs' : 'It needs') + ' an ICU bed afterwards and none is free at that time.' : 'No surgery is cancelled in today\'s forecast.'; },
      hing: function (v) { return v.n ? 'Forecast ke hisaab se ' + v.n + ' surgery cancel hogi: ' + v.list + '. Inko baad mein ICU bed chahiye aur us waqt koi bed khali nahi hai.' : 'Aaj ke forecast mein koi surgery cancel nahi ho rahi.'; },
      hi: function (v) { return v.n ? 'फ़ोरकास्ट के हिसाब से ' + v.n + ' सर्जरी रद्द ' + (v.n > 1 ? 'होंगी' : 'होगी') + ': ' + v.list + '। इन्हें बाद में आईसीयू बेड चाहिए और उस समय कोई बेड खाली नहीं है।' : 'आज के फ़ोरकास्ट में कोई सर्जरी रद्द नहीं हो रही।'; }
    },
    beds: {
      en: function (v) { return 'As things stand, the first bed comes free at ' + v.first + ' and the average is ' + v.avg + '. ' + v.left + ' of ' + v.fit + ' patients who are fit to go home leave their bed before 21:00.'; },
      hing: function (v) { return 'Abhi ke hisaab se pehla bed ' + v.first + ' baje khali hoga aur average ' + v.avg + ' hai. Ghar jaane ke liye fit ' + v.fit + ' mein se ' + v.left + ' patient 21:00 se pehle bed chhodte hain.'; },
      hi: function (v) { return 'अभी के हिसाब से पहला बेड ' + v.first + ' बजे खाली होगा और औसत ' + v.avg + ' है। घर जाने के लिए फ़िट ' + v.fit + ' में से ' + v.left + ' मरीज़ 21:00 से पहले बेड छोड़ते हैं।'; }
    },
    shock: {
      en: function (v) { return 'I added that to today: ' + v.what + '. The forecast now shows ' + v.c + ' surgeries cancelled and emergency patients waiting ' + v.bh + ' hours for beds (it was ' + v.bh0 + ').' + (v.planC != null ? ' With your plan in place: ' + v.planC + ' cancelled and ' + v.planBh + ' hours.' : ''); },
      hing: function (v) { return 'Maine yeh aaj ke din mein jod diya: ' + v.what + '. Ab forecast mein ' + v.c + ' surgery cancel hai aur emergency ke patient bed ke liye ' + v.bh + ' ghante wait karte hain (pehle ' + v.bh0 + ' tha).' + (v.planC != null ? ' Aapke plan ke saath: ' + v.planC + ' cancel aur ' + v.planBh + ' ghante.' : ''); },
      hi: function (v) { return 'मैंने यह आज के दिन में जोड़ दिया: ' + v.what + '। अब फ़ोरकास्ट में ' + v.c + ' सर्जरी रद्द हैं और इमरजेंसी के मरीज़ बेड के लिए ' + v.bh + ' घंटे इंतज़ार करते हैं (पहले ' + v.bh0 + ' था)।' + (v.planC != null ? ' आपके प्लान के साथ: ' + v.planC + ' रद्द और ' + v.planBh + ' घंटे।' : ''); }
    },
    help: {
      en: function () { return 'I can answer questions about today\'s beds and surgeries. Ask when the first jam is, why it happens, what to do about it, or tell me something that changed, such as an accident or a late doctor.'; },
      hing: function () { return 'Main aaj ke beds aur surgeries ke baare mein bata sakta hoon. Poochiye ki pehla jam kab hoga, kyun hoga, kya karein, ya bataiye ki kya badla hai, jaise accident ya doctor late.'; },
      hi: function () { return 'मैं आज के बेड और सर्जरी के बारे में बता सकता हूँ। पूछिए कि पहला जाम कब होगा, क्यों होगा, क्या करें, या बताइए कि क्या बदला है, जैसे एक्सीडेंट या डॉक्टर लेट।'; }
    }
  };
  var SHOCK_WORDS = {
    accident: { en: 'a road accident with 6 patients at ', hing: 'road accident, 6 patient, ', hi: 'सड़क हादसा, 6 मरीज़, ' },
    insuranceSlow: { en: 'the insurance desk is short-staffed', hing: 'insurance desk par staff kam hai', hi: 'बीमा डेस्क पर स्टाफ़ कम है' },
    roundsLate: { en: 'doctors\' rounds run one hour late', hing: 'doctor ke rounds ek ghanta late hain', hi: 'डॉक्टर के राउंड एक घंटा लेट हैं' }
  };

  /* ctx: { base, plan, hasPlan, fixes, cfg, now, run(fixIds, extraShocks) -> result, best(onTest) } */
  function ask(text, ctx) {
    var l = lang(text), d = detect(text), m = ctx.base.metrics, out = { lang: l, tests: [], text: '', plan: null, shock: null };
    var v;
    if (d.intent === 'when') {
      var j = m.firstJam, c = m.cancelled[0];
      var snap = j ? ctx.base.snaps[Math.floor((j.t - E.DAY_START) / E.SNAP)] : null;
      out.text = T.when[l]({ jam: !!j, dept: j ? DEPT[j.dept][l] : '', t: j ? E.fmt(j.t) : '', sd: snap ? Math.max(1, ctx.cfg.stepDowns ? ctx.cfg.stepDowns.length : 2) : 0,
        c1: c ? c.name : null, c1t: c ? E.fmt(c.at) : null });
    } else if (d.intent === 'why') {
      var firstOrd = Math.min.apply(null, ctx.base.dis.map(function (x) { return x.ordT; }));
      out.text = T.why[l]({ fit: ctx.base.dis.length, ord: E.fmt(firstOrd), dh: m.dischargeHours ? h1(m.dischargeHours) : '5', bf: E.fmt(m.avgBedFree) });
    } else if (d.intent === 'best') {
      var shown = 0;
      var b = ctx.best(function (r) {
        if (r.fixes.length <= 1 && shown < 6) { shown++; out.tests.push((r.fixes.length ? fixList(r.fixes, 'en') : 'no change') + ': ' + h1(r.cancels) + ' cancelled on average'); }
      });
      var pr = ctx.run(b.fixes).metrics;
      out.tests.push(fixList(b.fixes, 'en') + ': ' + pr.cancelCount + ' cancelled, beds free at ' + E.fmt(pr.avgBedFree));
      out.plan = b.fixes;
      out.text = b.fixes.length ? T.best[l]({ n: b.tested, fixes: fixList(b.fixes, l), a: m.cancelCount, b: pr.cancelCount,
        bf1: E.fmt(m.avgBedFree), bf2: E.fmt(pr.avgBedFree), bh1: h1(m.boardHours), bh2: h1(pr.boardHours) })
        : T.cancel[l]({ n: 0 });
    } else if (d.intent === 'fix') {
      var r1 = ctx.run([d.fix]).metrics;
      out.tests.push(testLine([d.fix], r1, l));
      out.plan = [d.fix];
      out.text = T.fix[l]({ fix: FIX_WORDS[d.fix][l], a: m.cancelCount, b: r1.cancelCount, bf1: E.fmt(m.avgBedFree), bf2: E.fmt(r1.avgBedFree), bh1: h1(m.boardHours), bh2: h1(r1.boardHours) });
    } else if (d.intent === 'cancel') {
      out.text = T.cancel[l]({ n: m.cancelCount, list: join(cases(m), l) });
    } else if (d.intent === 'beds') {
      var frees = ctx.base.dis.map(function (x) { return x.tBedFree; }).filter(function (x) { return x != null; });
      out.text = T.beds[l]({ first: frees.length ? E.fmt(Math.min.apply(null, frees)) : '21:00', avg: E.fmt(m.avgBedFree), left: m.leftToday, fit: ctx.base.dis.length });
    } else if (d.intent === 'shock') {
      var at = d.shock === 'accident' ? parseTime(text, ctx.now + 90) : ctx.now;
      var sh = { type: d.shock, at: at };
      var nb = ctx.run([], [sh]).metrics;
      out.tests.push('today with this change: ' + nb.cancelCount + ' cancelled, ' + h1(nb.boardHours) + ' hours waiting for beds');
      var np = ctx.hasPlan ? ctx.run(Object.keys(ctx.fixes), [sh]).metrics : null;
      if (np) out.tests.push('your plan with this change: ' + np.cancelCount + ' cancelled, ' + h1(np.boardHours) + ' hours waiting');
      out.shock = sh;
      out.text = T.shock[l]({ what: SHOCK_WORDS[d.shock][l] + (d.shock === 'accident' ? E.fmt(at) : ''), c: nb.cancelCount, bh: h1(nb.boardHours), bh0: h1(m.boardHours),
        planC: np ? np.cancelCount : null, planBh: np ? h1(np.boardHours) : null });
    } else {
      out.text = T.help[l]();
    }
    return out;
  }

  /* Demo reader: returns the sample day regardless of the photo. */
  function read() {
    return { wardBeds: 24, wardOccupied: 24, icuBeds: 6, icuOccupied: 6, fitForDischarge: 9, insured: 6,
      stepDowns: [600, 645], plannedAdmissions: [815, 850, 890, 930, 975] };
  }

  root.NabzAssistant = { ask: ask, read: read, lang: lang, FIX_WORDS: FIX_WORDS, SHOCK_WORDS: SHOCK_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
