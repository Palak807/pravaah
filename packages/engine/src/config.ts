/* Defaults, fixes, and day constants — ported verbatim from legacy/js/engine.js. */
import type { Config, Fix } from './types.js';

export const DAY_START = 480; // 08:00
export const DAY_END = 1260; // 21:00
export const SNAP = 5; // minutes between stored snapshots

export const DEFAULTS: Config = {
  wardBeds: 24,
  wardOccupied: 24,
  icuBeds: 6,
  icuOccupied: 6,
  edBays: 6,
  fitForDischarge: 9,
  insured: 6,
  stepDowns: [600, 645], // ICU patients ready for the ward at 10:00 and 10:45
  theatres: [
    [
      { name: 'Gallbladder removal', est: 90, icu: false },
      { name: 'Hernia repair', est: 90, icu: false },
      { name: 'Thyroid surgery', est: 75, icu: false },
      { name: 'Appendix removal', est: 60, icu: false },
    ],
    [
      { name: 'Hip replacement', est: 120, icu: false },
      { name: 'Bowel surgery', est: 120, icu: true },
      { name: 'Spine surgery', est: 90, icu: true },
    ],
  ],
  plannedAdmissions: [815, 850, 890, 930, 975],
  theatreOpen: 540,
  theatreClose: 1050,
  overtimeClose: 1170,
  orderWindow: [690, 810], // discharge orders written 11:30 to 13:30 by default
  earlySpread: 20, // with early rounds: within 20 minutes of the decision
  summary: { med: 55, sig: 0.22, servers: 2 },
  bill: { med: 35, sig: 0.18, servers: 1 },
  approval: { med: 150, sig: 0.28 },
  prefileFactor: 0.4,
  cleanMin: 30,
  housekeeping: 1,
  holdMax: 75,
  surgFactor: { med: 1.15, sig: 0.1 },
  edRatePerHour: 1.8,
  edWardShare: { 1: 0.5, 2: 0.26, 3: 0.05 },
  edTreat: { 1: 110, 2: 80, 3: 45 },
  admissionPatience: 240,
  weights: { cancel: 60, board: 4, blocked: 6, putOff: 30 },
};

export const FIXES: Fix[] = [
  {
    id: 'earlyRound',
    name: 'Do discharge rounds first thing',
    owner: 'Medical superintendent',
    what: 'Doctors write discharge orders before clinic starts, not after.',
  },
  {
    id: 'lounge',
    name: 'Open a discharge lounge',
    owner: 'Nursing in-charge',
    what: 'Insured patients wait for approval in a lounge, so the bed is freed once the bill is closed.',
  },
  {
    id: 'prefile',
    name: 'Send insurance papers early',
    owner: 'Insurance desk',
    what: 'File the discharge request with the insurer while the summary is being written.',
  },
  {
    id: 'housekeeping',
    name: 'Add a second cleaning team',
    owner: 'Housekeeping supervisor',
    what: 'Two teams turn beds around after patients leave.',
  },
  {
    id: 'overtime',
    name: 'Allow two hours of theatre overtime',
    owner: 'Theatre in-charge',
    what: 'Theatres may run until 19:30 if a case is delayed.',
  },
];

export function merge(cfg?: Partial<Config>): Config {
  const C: Record<string, unknown> = {};
  const src = DEFAULTS as unknown as Record<string, unknown>;
  for (const k in src) C[k] = src[k];
  const over = (cfg || {}) as Record<string, unknown>;
  for (const key in over) C[key] = over[key];
  return C as unknown as Config;
}
