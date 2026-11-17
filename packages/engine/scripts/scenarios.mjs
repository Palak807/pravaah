/* Shared scenario matrix used by BOTH the golden generator (against the legacy
   engine) and the Vitest parity test (against the TS port). Keep them identical. */

// The sample day the prototype reads from register photos.
const SAMPLE = {
  wardBeds: 24,
  wardOccupied: 24,
  icuBeds: 6,
  icuOccupied: 6,
  fitForDischarge: 9,
  insured: 6,
  stepDowns: [600, 645],
  plannedAdmissions: [815, 850, 890, 930, 975],
};

export const simulateScenarios = [
  { name: 'default cfg, default opts', cfg: undefined, opts: undefined },
  { name: 'sample day-2 at 08:30', cfg: SAMPLE, opts: { seed: 'day-2', now: 510 } },
  { name: 'sample, early round + lounge', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, fixes: { earlyRound: true, lounge: true } } },
  { name: 'sample, all five fixes', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, fixes: { earlyRound: true, lounge: true, prefile: true, housekeeping: true, overtime: true } } },
  { name: 'sample, some done ticks', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, done: { D1: { order: true, summary: true }, D7: { bill: true } } } },
  { name: 'sample, accident at 11:00', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, shocks: [{ type: 'accident', at: 660 }] } },
  { name: 'sample, insurance slow', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, shocks: [{ type: 'insuranceSlow', at: 510 }] } },
  { name: 'sample, rounds late', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, shocks: [{ type: 'roundsLate', at: 510 }] } },
  { name: 'smaller ward, fewer discharges', cfg: { ...SAMPLE, wardBeds: 18, wardOccupied: 18, fitForDischarge: 5, insured: 3 }, opts: { seed: 'alt-day', now: 540 } },
  { name: 'different seed', cfg: SAMPLE, opts: { seed: 'friday-rush', now: 510 } },
];

export const riskScenarios = [
  { name: 'baseline risk n=20', cfg: SAMPLE, opts: { seed: 'day-2', now: 510 }, n: 20 },
  { name: 'risk with fixes n=8', cfg: SAMPLE, opts: { seed: 'day-2', now: 510, fixes: { earlyRound: true } }, n: 8 },
];

export const bestPlanScenarios = [
  { name: 'best plan for sample day', cfg: SAMPLE, opts: { seed: 'day-2', now: 510 } },
];

/** Reduce the result to the fields consumers rely on, in a JSON-safe shape. */
export function liteResult(r) {
  return {
    snaps: r.snaps,
    events: r.events,
    metrics: r.metrics,
    dis: r.dis,
    demand: r.demand,
    cases: r.cases.map((list) =>
      list.map((c) => ({
        id: c.id,
        name: c.name,
        icu: c.icu,
        status: c.status,
        planned: c.planned,
        startT: c.startT,
        endT: c.endT,
        cancelT: c.cancelT,
        reason: c.reason,
      })),
    ),
    now: r.now,
  };
}
