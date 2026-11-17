/* Run the same plan over several versions of the day. Ported verbatim from legacy/js/engine.js. */
import { simulate } from './simulate.js';
import type { Config, SimulateOpts, RiskResult } from './types.js';

export function risk(cfg?: Partial<Config>, opts?: SimulateOpts, n?: number): RiskResult {
  n = n || 20;
  opts = opts || {};
  let hit = 0,
    board = 0,
    cancels = 0,
    cost = 0;
  for (let i = 0; i < n; i++) {
    const o: SimulateOpts = {};
    for (const k in opts) (o as Record<string, unknown>)[k] = (opts as Record<string, unknown>)[k];
    o.seed = (opts.seed || 'day-1') + '#' + i;
    const r = simulate(cfg, o).metrics;
    if (r.cancelCount > 0) hit++;
    board += r.boardHours;
    cancels += r.cancelCount;
    cost += r.cost;
  }
  return { runs: n, daysWithCancel: hit, boardHours: board / n, cancels: cancels / n, cost: cost / n };
}
