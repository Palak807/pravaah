/* Public types for the Nabz simulation engine.
   These describe the shapes that cross the package boundary (config in, result out).
   Internal working structures inside simulate() are kept local to that module. */

export interface SurgeryCaseDef {
  name: string;
  est: number;
  icu: boolean;
}

export interface ServiceDist {
  med: number;
  sig: number;
  servers?: number;
}

export interface Config {
  wardBeds: number;
  wardOccupied: number;
  icuBeds: number;
  icuOccupied: number;
  edBays: number;
  fitForDischarge: number;
  insured: number;
  stepDowns: number[];
  theatres: SurgeryCaseDef[][];
  plannedAdmissions: number[];
  theatreOpen: number;
  theatreClose: number;
  overtimeClose: number;
  orderWindow: [number, number];
  earlySpread: number;
  summary: ServiceDist;
  bill: ServiceDist;
  approval: ServiceDist;
  prefileFactor: number;
  cleanMin: number;
  housekeeping: number;
  holdMax: number;
  surgFactor: { med: number; sig: number };
  edRatePerHour: number;
  edWardShare: Record<number, number>;
  edTreat: Record<number, number>;
  admissionPatience: number;
  weights: { cancel: number; board: number; blocked: number; putOff: number };
}

export type FixId = 'earlyRound' | 'lounge' | 'prefile' | 'housekeeping' | 'overtime';

export interface Fix {
  id: FixId;
  name: string;
  owner: string;
  what: string;
}

export type ShockType = 'accident' | 'insuranceSlow' | 'roundsLate';

export interface Shock {
  type: ShockType;
  at: number;
}

/** Per-patient step completions already done in the real world (ticked on the discharge list). */
export type DoneMap = Record<string, { order?: boolean; summary?: boolean; bill?: boolean; approval?: boolean }>;

export interface SimulateOpts {
  fixes?: Partial<Record<FixId, boolean>>;
  now?: number;
  seed?: string;
  done?: DoneMap;
  shocks?: Shock[];
}

/* ---------- snapshot shapes ---------- */

export type DischargeStage =
  | 'wait' | 'sumQ' | 'sum' | 'billQ' | 'bill' | 'billed' | 'appr' | 'pack' | 'gone';

export interface WardBedSnap {
  n: number;
  st: 'free' | 'occ' | 'dirty' | 'clean';
  kind: string | null;
  pid: string | null;
  stage: DischargeStage | null;
}

export interface IcuBedSnap {
  n: number;
  st: 'free' | 'occ' | 'clean' | 'res';
  kind: string | null;
  pid: string | null;
  blocked: number | null;
}

export interface EdBaySnap {
  pid: string;
  acuity: number;
  board: number | null;
}

export interface TheatreCaseSnap {
  id: string;
  name: string;
  icu: boolean;
  status: string;
  planned: number;
  startT: number | null;
  endT: number | null;
  cancelT: number | null;
  reason: string | null;
  hold: number | null;
}

export type DeptKey = 'ed' | 'icu' | 'ward' | 'th' | 'dis';
export type Levels = Record<DeptKey, number>;

export interface SnapCounts {
  board: number;
  sd: number;
  plan: number;
  free: number;
  icuFree: number;
  notOrdered: number;
  stillInBed: number;
  slowest: number;
  held: number;
  busyBays: number;
}

export interface Snapshot {
  t: number;
  ward: WardBedSnap[];
  icu: IcuBedSnap[];
  ed: (EdBaySnap | null)[];
  edQueue: number;
  th: TheatreCaseSnap[][];
  lounge: number;
  gone: number;
  n: SnapCounts;
  lv: Levels;
}

export interface SimEvent {
  t: number;
  dept: string;
  level: number;
  text: string;
}

export interface CancelledCase {
  id: string;
  name: string;
  theatre: number;
  at: number;
  reason: string;
  planned: number;
}

export interface Metrics {
  cancelled: CancelledCase[];
  cancelCount: number;
  bedCancels: number;
  boardHours: number;
  boardCount: number;
  longestBoard: number;
  blockedHours: number;
  avgBedFree: number | null;
  putOff: number;
  dischargeHours: number | null;
  leftToday: number;
  firstJam: { dept: DeptKey; t: number } | null;
  cost: number;
}

export interface DischargePatient {
  id: string;
  bed: number;
  insured: boolean;
  ordT: number;
  stage: DischargeStage;
  tOrd: number | null;
  tSum: number | null;
  tBill: number | null;
  tAppr: number | null;
  leaveBedAt: number | null;
  leftBed: number | null;
  tHome: number | null;
  tBedFree: number | null;
  inLounge: boolean;
}

export interface DemandItem {
  t: number;
  kind: 'sd' | 'ed' | 'plan';
  n?: number;
}

export interface SimulationResult {
  snaps: Snapshot[];
  events: SimEvent[];
  metrics: Metrics;
  dis: DischargePatient[];
  demand: DemandItem[];
  cases: TheatreCaseFull[][];
  config: Config;
  now: number;
}

/** A theatre case as stored on the result (richer than the per-snapshot view). */
export interface TheatreCaseFull {
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
}

export interface RiskResult {
  runs: number;
  daysWithCancel: number;
  boardHours: number;
  cancels: number;
  cost: number;
}

export interface PlanTestResult {
  fixes: FixId[];
  cost: number;
  cancels: number;
  boardHours: number;
  daysWithCancel: number;
  runs: number;
}

export interface BestPlanResult {
  fixes: FixId[];
  tested: number;
  results: PlanTestResult[];
  baseline: PlanTestResult;
  chosen: PlanTestResult;
}
