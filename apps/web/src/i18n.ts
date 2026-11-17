/* Presentation vocabulary used by the frontend (shock chips, discharge list).
   The assistant's answers come from the API; these are pure display strings. */
import type { FixId, ShockType } from '@nabz/engine';

export type Lang = 'en' | 'hi' | 'hing';

export const FIX_WORDS: Record<FixId, Record<Lang, string>> = {
  earlyRound: { en: 'discharge rounds first thing', hing: 'subah sabse pehle discharge rounds', hi: 'सुबह सबसे पहले डिस्चार्ज राउंड' },
  lounge: { en: 'a discharge lounge', hing: 'discharge lounge', hi: 'डिस्चार्ज लाउंज' },
  prefile: { en: 'sending insurance papers early', hing: 'insurance ke papers jaldi bhejna', hi: 'बीमा के कागज़ जल्दी भेजना' },
  housekeeping: { en: 'a second cleaning team', hing: 'doosri safai team', hi: 'दूसरी सफ़ाई टीम' },
  overtime: { en: 'theatre overtime', hing: 'theatre overtime', hi: 'थिएटर ओवरटाइम' },
};

export const SHOCK_WORDS: Record<ShockType, Record<Lang, string>> = {
  accident: { en: 'a road accident with 6 patients at ', hing: 'road accident, 6 patient, ', hi: 'सड़क हादसा, 6 मरीज़, ' },
  insuranceSlow: { en: 'the insurance desk is short-staffed', hing: 'insurance desk par staff kam hai', hi: 'बीमा डेस्क पर स्टाफ़ कम है' },
  roundsLate: { en: "doctors' rounds run one hour late", hing: 'doctor ke rounds ek ghanta late hain', hi: 'डॉक्टर के राउंड एक घंटा लेट हैं' },
};

export const OWNER_HI: Record<string, string> = {
  'Medical superintendent': 'मेडिकल सुपरिंटेंडेंट',
  'Nursing in-charge': 'नर्सिंग इंचार्ज',
  'Insurance desk': 'बीमा डेस्क',
  'Housekeeping supervisor': 'हाउसकीपिंग सुपरवाइज़र',
  'Theatre in-charge': 'थिएटर इंचार्ज',
};

/* Discharge-list strings, ported from legacy/js/app.js (L). */
type ListLang = 'en' | 'hi';
export interface ListStrings {
  title: string;
  lede: string;
  order: string;
  summary: string;
  bill: string;
  approval: string;
  duty: string;
  billing: string;
  insdesk: string;
  insured: string;
  cash: string;
  bed: string;
  sd: (t: string, c: string) => string;
  ed: (t: string) => string;
  plan: (t: string) => string;
  none: string;
  free: (t: string) => string;
  late: (n: number) => string;
  ok: string;
  never: string;
  actions: string;
  effect: string;
  waiting: string;
  nothing: string;
  m1: string;
  m2: string;
  m3: string;
  m4: string;
  was: string;
  print: string;
}

export const L: Record<ListLang, ListStrings> = {
  en: {
    title: "Today's discharge list",
    lede: 'In the order the beds should come free. Tick a step when the ward confirms it, and the forecast updates.',
    order: 'Discharge order',
    summary: 'Discharge summary',
    bill: 'Final bill',
    approval: 'Insurer approval',
    duty: 'Duty doctor',
    billing: 'Billing desk',
    insdesk: 'Insurance desk',
    insured: 'insured',
    cash: 'paying cash',
    bed: 'Bed',
    sd: (t, c) => 'Needed by ' + t + ': an ICU patient is ready for the ward. Moving them frees the ICU bed for ' + c + '.',
    ed: (t) => 'Needed by ' + t + ': an emergency patient will be waiting for a bed.',
    plan: (t) => 'Needed by ' + t + ': a planned admission arrives.',
    none: 'Keeps a bed ready for evening emergencies.',
    free: (t) => 'On the current plan this bed is free at ' + t + '.',
    late: (n) => ' That is ' + n + ' min after it is needed.',
    ok: ' In time.',
    never: 'On the current plan this bed is not free before 21:00.',
    actions: 'Agreed for today',
    effect: 'What this changes',
    waiting: 'Still waiting on',
    nothing: 'Nothing. Every step is ticked.',
    m1: 'Surgeries cancelled',
    m2: 'Hours emergency patients wait for a bed',
    m3: 'Average time a bed comes free',
    m4: 'Admissions put off',
    was: 'was ',
    print: 'Print the list',
  },
  hi: {
    title: 'आज की डिस्चार्ज सूची',
    lede: 'उसी क्रम में जिसमें बेड खाली होने चाहिए। वार्ड से पुष्टि होते ही स्टेप पर टिक करें, फ़ोरकास्ट अपने आप बदल जाएगा।',
    order: 'डिस्चार्ज ऑर्डर',
    summary: 'डिस्चार्ज समरी',
    bill: 'फ़ाइनल बिल',
    approval: 'बीमा की मंज़ूरी',
    duty: 'ड्यूटी डॉक्टर',
    billing: 'बिलिंग डेस्क',
    insdesk: 'बीमा डेस्क',
    insured: 'बीमा',
    cash: 'कैश',
    bed: 'बेड',
    sd: (t, c) => t + ' बजे तक चाहिए: आईसीयू का एक मरीज़ वार्ड के लिए तैयार है। उसे शिफ़्ट करने से ' + c + ' के लिए आईसीयू बेड खाली होगा।',
    ed: (t) => t + ' बजे तक चाहिए: इमरजेंसी का एक मरीज़ बेड का इंतज़ार कर रहा होगा।',
    plan: (t) => t + ' बजे तक चाहिए: एक मरीज़ भर्ती होने आएगा।',
    none: 'शाम की इमरजेंसी के लिए बेड तैयार रहेगा।',
    free: (t) => 'मौजूदा प्लान में यह बेड ' + t + ' बजे खाली होगा।',
    late: (n) => ' यह ज़रूरत से ' + n + ' मिनट बाद है।',
    ok: ' समय पर।',
    never: 'मौजूदा प्लान में यह बेड 21:00 से पहले खाली नहीं होगा।',
    actions: 'आज के लिए तय',
    effect: 'इससे क्या बदलता है',
    waiting: 'अभी किस पर रुका है',
    nothing: 'कुछ नहीं। सब स्टेप पूरे हैं।',
    m1: 'रद्द सर्जरी',
    m2: 'इमरजेंसी मरीज़ों का बेड के लिए इंतज़ार (घंटे)',
    m3: 'बेड खाली होने का औसत समय',
    m4: 'टाली गई भर्तियाँ',
    was: 'पहले ',
    print: 'सूची प्रिंट करें',
  },
};
