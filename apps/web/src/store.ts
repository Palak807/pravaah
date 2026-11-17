import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  simulate,
  risk,
  DAY_START,
  DAY_END,
  type SimulationResult,
  type RiskResult,
  type FixId,
  type Shock,
  type SimulateOpts,
  type Config,
} from '@nabz/engine';
import { buildConfig, SAMPLE_NUMBERS, toFixObj, type ReadNumbers, type DischargeRow, type TheatreCase } from './sim';
import { api, type AskAnswer } from './api/client';

export type Speed = 'slow' | 'normal' | 'fast';
export type View = 'base' | 'plan';
export type Tab = 'ask' | 'plan';

export interface ChatUser {
  who: 'u';
  text: string;
}
export interface ChatBot {
  who: 'a';
  tests: string[];
  text: string;
  plan: FixId[] | null;
  shock: Shock | null;
  shown: number;
  ready: boolean;
}
export type ChatMsg = ChatUser | ChatBot;

export interface StoreState {
  step: number;
  maxStep: number;
  // registers
  slots: (string | 'sample' | null)[];
  reading: boolean;
  readDone: boolean;
  found: string[][];
  // numbers (editable config) + flag
  numbers: ReadNumbers;
  flagYes: boolean;
  // the actual patients / surgeries read off the photos (empty => use sample identities)
  discharges: DischargeRow[];
  theatres: TheatreCase[];
  // scenario
  seed: string;
  now: number;
  fixes: Record<string, boolean>;
  done: Record<string, Record<string, boolean>>;
  shocks: Shock[];
  // view + playback
  view: View;
  viewT: number;
  playing: boolean;
  speed: Speed;
  pauseOnJam: boolean;
  guided: boolean;
  toolsOpen: boolean;
  focusStation: string | null;
  // side panel
  tab: Tab;
  chat: ChatMsg[];
  status: string;
  busy: boolean;
  // discharge list
  listLang: 'en' | 'hi';
  // selection
  sel: string | null;
  // computed
  base: SimulationResult;
  plan: SimulationResult;
  hasPlan: boolean;
  riskBase: RiskResult;
  riskPlan: RiskResult;
  // persistence ids
  readingId: string | null;
  dayId: string | null;

  // actions
  go: (n: number) => void;
  setSlot: (i: number, v: string) => void;
  readRegisters: () => Promise<void>;
  changeNumber: (k: keyof ReadNumbers, delta: number, min: number, max: number) => void;
  setFlag: (yes: boolean) => void;
  toForecast: () => void;
  setView: (v: View) => void;
  selectBed: (key: string) => void;
  setViewT: (t: number) => void;
  skipToNextEvent: () => void;
  play: () => void;
  pause: () => void;
  setSpeed: (s: Speed) => void;
  setPauseOnJam: (v: boolean) => void;
  takeControl: () => void;
  setGuided: (v: boolean) => void;
  setToolsOpen: (v: boolean) => void;
  setFocusStation: (s: string | null) => void;
  setTab: (t: Tab) => void;
  toggleFix: (id: FixId, on: boolean) => void;
  findBest: () => Promise<void>;
  clearPlan: () => void;
  ask: (text: string) => Promise<void>;
  usePlan: (ids: FixId[]) => void;
  removeShock: (i: number) => void;
  applyShock: (s: Shock) => void;
  setListLang: (l: 'en' | 'hi') => void;
  tick: (id: string, k: string, checked: boolean) => void;
}

const STEP_KEYS = ['order', 'summary', 'bill', 'approval'];

function cfgFrom(numbers: ReadNumbers, flagYes: boolean, theatres?: TheatreCase[]): Partial<Config> {
  return buildConfig(numbers, flagYes, theatres);
}
function optsFrom(s: Pick<StoreState, 'seed' | 'now' | 'shocks'>, extra?: Partial<SimulateOpts>): SimulateOpts {
  return { seed: s.seed, now: s.now, shocks: s.shocks, ...extra };
}
function anyDone(done: Record<string, Record<string, boolean>>): boolean {
  for (const k in done) for (const j in done[k]) if (done[k][j]) return true;
  return false;
}

/** Recompute base/plan/risk from the current scenario. */
function computed(s: StoreState): Pick<StoreState, 'base' | 'plan' | 'hasPlan' | 'riskBase' | 'riskPlan' | 'view'> {
  const cfg = cfgFrom(s.numbers, s.flagYes, s.theatres);
  const base = simulate(cfg, optsFrom(s));
  const hasPlan = Object.keys(s.fixes).length > 0 || anyDone(s.done);
  const plan = hasPlan ? simulate(cfg, optsFrom(s, { fixes: s.fixes as Partial<Record<FixId, boolean>>, done: s.done })) : base;
  const riskBase = risk(cfg, optsFrom(s), 20);
  const riskPlan = hasPlan ? risk(cfg, optsFrom(s, { fixes: s.fixes as Partial<Record<FixId, boolean>>, done: s.done }), 20) : riskBase;
  const view: View = hasPlan ? s.view : 'base';
  return { base, plan, hasPlan, riskBase, riskPlan, view };
}

/* Best-effort persistence; never blocks or breaks the UI if the API is unavailable. */
async function persistDay(get: () => StoreState) {
  const s = get();
  if (!s.dayId) return;
  try {
    await api.updateDay(s.dayId, { seed: s.seed, fixes: s.fixes, done: s.done, shocks: s.shocks });
  } catch (e) {
    console.warn('[persist] day update failed', e);
  }
}

const initial = (() => {
  const numbers = { ...SAMPLE_NUMBERS };
  const seed = 'day-2';
  const now = 510;
  const cfg = cfgFrom(numbers, true);
  const base = simulate(cfg, { seed, now, shocks: [] });
  const riskBase = risk(cfg, { seed, now, shocks: [] }, 20);
  return { numbers, seed, now, base, plan: base, riskBase, riskPlan: riskBase };
})();

/** Selector hook with shallow equality — so a component only re-renders when the
    specific slice it reads changes, not on every playback frame. */
export function useStoreShallow<T>(selector: (s: StoreState) => T): T {
  return useStore(useShallow(selector));
}

export const useStore = create<StoreState>((set, get) => ({
  step: 1,
  maxStep: 1,
  slots: [null, null, null],
  reading: false,
  readDone: false,
  found: [[], [], []],
  numbers: initial.numbers,
  flagYes: true,
  discharges: [],
  theatres: [],
  seed: initial.seed,
  now: initial.now,
  fixes: {},
  done: {},
  shocks: [],
  view: 'base',
  viewT: 510,
  playing: false,
  speed: 'slow',
  pauseOnJam: false,
  guided: true,
  toolsOpen: false,
  focusStation: null,
  tab: 'ask',
  chat: [],
  status: '',
  busy: false,
  listLang: 'en',
  sel: null,
  base: initial.base,
  plan: initial.plan,
  hasPlan: false,
  riskBase: initial.riskBase,
  riskPlan: initial.riskPlan,
  readingId: null,
  dayId: null,

  go: (n) => set((s) => ({ step: n, maxStep: Math.max(s.maxStep, n), playing: false })),

  setSlot: (i, v) =>
    set((s) => {
      const slots = s.slots.slice();
      slots[i] = v;
      return { slots };
    }),

  readRegisters: async () => {
    const images = get().slots.filter((x): x is string => typeof x === 'string' && x.startsWith('data:'));
    if (images.length < 3) return;
    set({ reading: true, found: [[], [], []] });
    try {
      const { numbers: r } = await api.readRegisters(images);
      const n: ReadNumbers = {
        wardBeds: r.wardBeds,
        wardOccupied: r.wardOccupied,
        icuBeds: r.icuBeds,
        icuOccupied: r.icuOccupied,
        fitForDischarge: r.fitForDischarge,
        insured: r.insured,
        stepDowns: r.stepDowns,
        plannedAdmissions: r.plannedAdmissions,
      };
      const discharges = r.discharges ?? [];
      const theatres = r.theatres ?? [];
      set({
        numbers: n,
        discharges,
        theatres,
        readDone: true,
        reading: false,
        found: [
          [`${n.wardBeds} ward beds, ${n.wardOccupied} occupied`, `${n.fitForDischarge} fit to go home today`, `${n.insured} of them insured`],
          [theatres.length ? `${theatres.length} surgeries on the theatre list` : `theatre list read`, `${theatres.filter((t) => t.icu).length} need an ICU bed afterwards`],
          [`${n.icuBeds} ICU beds`, `${n.plannedAdmissions.length} admissions due this afternoon`],
        ],
      });
    } catch (e) {
      console.warn('[read] OCR request failed, using defaults', e);
      set({
        reading: false,
        readDone: true,
        numbers: { ...SAMPLE_NUMBERS },
        discharges: [],
        theatres: [],
        found: [['Could not read the photos clearly — loaded sensible defaults, please check and correct.'], [], []],
      });
    }
  },

  changeNumber: (k, delta, min, max) =>
    set((s) => {
      const numbers = { ...s.numbers } as ReadNumbers;
      const cur = numbers[k] as number;
      numbers[k] = (delta > 0 ? Math.min(max, cur + 1) : Math.max(min, cur - 1)) as never;
      numbers.wardOccupied = Math.min(numbers.wardOccupied, numbers.wardBeds);
      numbers.insured = Math.min(numbers.insured, numbers.fitForDischarge);
      return { numbers };
    }),

  setFlag: (yes) => set({ flagYes: yes }),

  toForecast: () => {
    set({ fixes: {}, done: {}, shocks: [], chat: [], view: 'base', viewT: get().now, guided: true, toolsOpen: false, focusStation: null, playing: false });
    set((s) => computed(s));
    get().go(3);
    // Persist the reading + a day (best effort, non-blocking).
    (async () => {
      try {
        const s = get();
        const reading = await api.createReading({ ...s.numbers, discharges: s.discharges, theatres: s.theatres });
        const day = await api.createDay({ readingId: reading.id, seed: s.seed });
        set({ readingId: reading.id, dayId: day.id });
      } catch (e) {
        console.warn('[persist] could not create reading/day', e);
      }
    })();
  },

  setView: (v) => set({ view: v }),

  selectBed: (key) => set((s) => ({ sel: s.sel === key ? null : key })),

  setViewT: (t) => set({ viewT: Math.max(DAY_START, Math.min(DAY_END, t)) }),

  skipToNextEvent: () => {
    const s = get();
    const cur = s.view === 'plan' && s.hasPlan ? s.plan : s.base;
    const next = cur.events.find((e) => e.t > s.viewT + 0.5 && e.t <= DAY_END);
    set({ guided: false, playing: false, viewT: next ? next.t : DAY_END });
  },

  play: () => {
    const s = get();
    if (s.viewT >= DAY_END) set({ viewT: s.now });
    set({ playing: true });
  },
  pause: () => set({ playing: false }),

  setSpeed: (speed) => set({ speed }),
  setPauseOnJam: (pauseOnJam) => set({ pauseOnJam }),
  takeControl: () => set({ guided: false, playing: false }),
  setGuided: (guided) => set({ guided }),
  setToolsOpen: (toolsOpen) => set({ toolsOpen }),
  setFocusStation: (focusStation) => set({ focusStation }),

  setTab: (tab) => set({ tab }),

  toggleFix: (id, on) => {
    set((s) => {
      const fixes = { ...s.fixes };
      if (on) fixes[id] = true;
      else delete fixes[id];
      return { fixes, status: '', view: Object.keys(fixes).length ? 'plan' : s.view };
    });
    set((s) => computed(s));
    persistDay(get);
  },

  findBest: async () => {
    const s = get();
    set({ busy: true, status: 'Testing plans on the twin…' });
    try {
      const b = await api.bestPlan(cfgFrom(s.numbers, s.flagYes, s.theatres), optsFrom(s));
      const fixes = toFixObj(b.fixes);
      const names = b.fixes.length
        ? b.fixes
            .map((id) => id) // human names resolved in UI; keep ids here
            .join(', ')
        : '';
      set({
        fixes,
        view: 'plan',
        busy: false,
        status: 'Tested ' + b.tested + ' plans on the twin. ' + (b.fixes.length ? 'Best: ' + names + '.' : 'No change needed.'),
      });
      set((st) => computed(st));
      persistDay(get);
    } catch (e) {
      console.warn('[best-plan] failed, falling back to local', e);
      set({ busy: false, status: 'Could not reach the server; try again.' });
    }
  },

  clearPlan: () => {
    set({ fixes: {}, status: '' });
    set((s) => computed(s));
    persistDay(get);
  },

  ask: async (text) => {
    text = text.trim();
    if (!text) return;
    set((s) => ({ chat: [...s.chat, { who: 'u', text }] }));
    const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = get();
    let answer: AskAnswer;
    try {
      const res = await api.ask({
        text,
        cfg: cfgFrom(s.numbers, s.flagYes, s.theatres),
        seed: s.seed,
        now: s.now,
        fixes: s.fixes,
        done: s.done,
        shocks: s.shocks,
        discharges: s.discharges,
      });
      answer = res.answer;
    } catch (e) {
      console.warn('[ask] failed', e);
      answer = { lang: 'en', tests: [], text: 'Sorry — I could not reach the twin just now. Please try again.', plan: null, shock: null };
    }
    const msg: ChatBot = { who: 'a', tests: answer.tests, text: answer.text, plan: answer.plan, shock: answer.shock, shown: 0, ready: false };
    set((st) => ({ chat: [...st.chat, msg] }));

    const idx = get().chat.length - 1;
    const patch = (fn: (m: ChatBot) => void) =>
      set((st) => {
        const chat = st.chat.slice();
        const m = { ...(chat[idx] as ChatBot) };
        fn(m);
        chat[idx] = m;
        return { chat };
      });

    const tickMsg = () => {
      const m = get().chat[idx] as ChatBot;
      if (m.shown < m.tests.length) {
        patch((mm) => (mm.shown = mm.shown + 1));
        setTimeout(tickMsg, quick ? 0 : 380);
        return;
      }
      setTimeout(
        () => {
          // What-ifs are previews only: the assistant describes the result but we do
          // NOT mutate today's forecast behind the user's back.
          patch((mm) => (mm.ready = true));
        },
        quick ? 0 : 450,
      );
    };
    tickMsg();
  },

  usePlan: (ids) => {
    set({ fixes: toFixObj(ids), view: 'plan', status: '' });
    set((s) => computed(s));
    persistDay(get);
  },

  removeShock: (i) => {
    set((s) => ({ shocks: s.shocks.filter((_, j) => j !== i) }));
    set((s) => computed(s));
    persistDay(get);
  },

  applyShock: (sh) => {
    set((s) => ({ shocks: [...s.shocks, sh] }));
    set((s) => computed(s));
    persistDay(get);
  },

  setListLang: (listLang) => set({ listLang }),

  tick: (id, k, checked) => {
    set((s) => {
      const done = { ...s.done, [id]: { ...(s.done[id] || {}) } };
      const ix = STEP_KEYS.indexOf(k);
      STEP_KEYS.forEach((key, j) => {
        if (checked ? j <= ix : j >= ix) done[id][key] = checked;
      });
      return { done, view: 'plan' as View };
    });
    set((s) => computed(s));
    persistDay(get);
  },
}));
