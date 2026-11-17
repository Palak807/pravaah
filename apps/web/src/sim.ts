/* Client-side engine helpers: patient names, config assembly, snapshot lookup.
   The engine runs in the browser so scrubbing/playback is instant. */
import { simulate, DAY_START, SNAP, type Config, type SimulationResult, type Snapshot, type SurgeryCaseDef, type DischargePatient } from '@nabz/engine';

export interface ReadNumbers {
  wardBeds: number;
  wardOccupied: number;
  icuBeds: number;
  icuOccupied: number;
  fitForDischarge: number;
  insured: number;
  stepDowns: number[];
  plannedAdmissions: number[];
}

/** A patient marked fit to go home, read off the ward register. */
export interface DischargeRow {
  bed: number;
  name: string;
  insured: boolean;
}
/** A surgery read off the operating-theatre list. */
export interface TheatreCase {
  name: string;
  icu: boolean;
}

export const SAMPLE_NUMBERS: ReadNumbers = {
  wardBeds: 24,
  wardOccupied: 24,
  icuBeds: 6,
  icuOccupied: 6,
  fitForDischarge: 9,
  insured: 6,
  stepDowns: [600, 645],
  plannedAdmissions: [815, 850, 890, 930, 975],
};

export const NAMES = [
  'Sunita Rao', 'Imran Sheikh', 'Kavita Nair', 'Harish Gupta', 'Meena Joshi', 'Arvind Pillai', 'Farah Ali', 'Deepak Verma', 'Lata Menon',
  'Rohit Bansal', 'Anjali Desai', 'Suresh Yadav', 'Nazia Khan', 'Vikram Shetty', 'Pooja Saxena', 'Mohan Das', 'Geeta Bhatt', 'Karan Malhotra',
  'Shanti Devi', 'Ajay Kulkarni', 'Rekha Sinha', 'Naveen Reddy', 'Asha Thomas', 'Prakash Jain', 'Seema Chawla', 'Tarun Bose', 'Usha Rani',
  'Manoj Tiwari', 'Divya Kapoor', 'Ramesh Patil', 'Zoya Mirza', 'Gopal Iyer', 'Nisha Arora', 'Sanjay Dubey', 'Bharti Soni', 'Yusuf Pathan',
];
export const DOCS = ['Dr. Mehta', 'Dr. Iyer', 'Dr. Khan'];
export const STEPS = ['Registers', 'Check', 'Today', 'Discharge list'];

/* Stable name map, built once from a sample day's starting snapshot (matches legacy app.js). */
export const sampleDay: SimulationResult = simulate(SAMPLE_NUMBERS as Partial<Config>, { seed: 'day-2' });
const nameMap: Record<string, string> = {};
(() => {
  let n = 0;
  sampleDay.snaps[0].ward.forEach((b) => {
    if (b.pid) nameMap[b.pid] = NAMES[n++ % NAMES.length];
  });
  sampleDay.snaps[0].icu.forEach((b) => {
    if (b.pid) nameMap[b.pid] = NAMES[n++ % NAMES.length];
  });
})();

export function nameOf(pid: string | null | undefined): string {
  if (!pid) return '';
  if (nameMap[pid]) return nameMap[pid];
  if (pid[0] === 'E' || pid[0] === 'X') return 'Emergency patient';
  if (pid[0] === 'P') return 'Planned admission';
  return 'Patient';
}
export function docOf(pid: string): string {
  return DOCS[parseInt(pid.slice(1), 10) % DOCS.length];
}

/** Turn the OCR'd theatre list into the engine's theatre layout (up to two theatres). */
export function theatresToConfig(cases: TheatreCase[]): SurgeryCaseDef[][] {
  const t: SurgeryCaseDef[][] = [[], []];
  cases.forEach((c, i) => t[i % 2].push({ name: c.name, est: c.icu ? 110 : 85, icu: !!c.icu }));
  return t.filter((theatre) => theatre.length > 0);
}

/** Build the engine config from the checked register numbers (+ the real theatre list, if read). */
export function buildConfig(numbers: ReadNumbers, flagYes: boolean, theatres?: TheatreCase[]): Partial<Config> {
  const c: Partial<Config> & ReadNumbers = { ...numbers };
  if (!flagYes) c.fitForDischarge = Math.max(0, c.fitForDischarge - 1);
  c.insured = Math.min(c.insured, c.fitForDischarge);
  c.wardOccupied = Math.min(c.wardOccupied, c.wardBeds);
  if (theatres && theatres.length) c.theatres = theatresToConfig(theatres);
  return c as Partial<Config>;
}

/** Pair the engine's discharge patients with the names/beds actually read off the register.
    Both are sorted by bed and paired by position, so each card shows a real patient. */
export function dischargeIdentity(dis: DischargePatient[], discharges?: DischargeRow[]): Record<string, DischargeRow> {
  if (!discharges || !discharges.length) return {};
  const byBed = [...dis].sort((a, b) => a.bed - b.bed);
  const ocr = [...discharges].sort((a, b) => a.bed - b.bed);
  const map: Record<string, DischargeRow> = {};
  byBed.forEach((d, i) => {
    if (ocr[i]) map[d.id] = ocr[i];
  });
  return map;
}

export function snapAt(r: SimulationResult, t: number): Snapshot {
  const i = Math.max(0, Math.min(r.snaps.length - 1, Math.round((t - DAY_START) / SNAP)));
  return r.snaps[i];
}

export function toFixObj(ids: string[]): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  ids.forEach((i) => (o[i] = true));
  return o;
}
