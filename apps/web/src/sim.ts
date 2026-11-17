/* Client-side engine helpers: patient names, config assembly, snapshot lookup.
   The engine runs in the browser so scrubbing/playback is instant. */
import { simulate, DAY_START, SNAP, type Config, type SimulationResult, type Snapshot } from '@nabz/engine';

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

/** Build the engine config from the checked register numbers + the "flag" answer. */
export function buildConfig(numbers: ReadNumbers, flagYes: boolean): Partial<Config> {
  const c: ReadNumbers = { ...numbers };
  if (!flagYes) c.fitForDischarge = Math.max(0, c.fitForDischarge - 1);
  c.insured = Math.min(c.insured, c.fitForDischarge);
  c.wardOccupied = Math.min(c.wardOccupied, c.wardBeds);
  return c as Partial<Config>;
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
