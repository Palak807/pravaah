/* Try every combination of up to three fixes and keep the cheapest plan that is
   within 4% of the best score. onTest is called for every plan tried.
   Ported verbatim from legacy/js/engine.js (findBestPlan). */
import { FIXES } from './config.js';
import { risk } from './risk.js';
import type { Config, SimulateOpts, FixId, PlanTestResult, BestPlanResult } from './types.js';

export function findBestPlan(
  cfg?: Partial<Config>,
  opts?: SimulateOpts,
  onTest?: (r: PlanTestResult) => void,
): BestPlanResult {
  opts = opts || {};
  const ids = FIXES.map((f) => f.id);
  const combos: FixId[][] = [[]];
  for (let a = 0; a < ids.length; a++) {
    combos.push([ids[a]]);
    for (let b = a + 1; b < ids.length; b++) {
      combos.push([ids[a], ids[b]]);
      for (let c = b + 1; c < ids.length; c++) combos.push([ids[a], ids[b], ids[c]]);
    }
  }
  const results: PlanTestResult[] = combos.map((set) => {
    const o: SimulateOpts = {};
    for (const k in opts) (o as Record<string, unknown>)[k] = (opts as Record<string, unknown>)[k];
    o.fixes = {};
    set.forEach((id) => {
      (o.fixes as Record<string, boolean>)[id] = true;
    });
    const r = risk(cfg, o, 8);
    const res: PlanTestResult = {
      fixes: set,
      cost: r.cost,
      cancels: r.cancels,
      boardHours: r.boardHours,
      daysWithCancel: r.daysWithCancel,
      runs: r.runs,
    };
    if (onTest) onTest(res);
    return res;
  });
  const best = results.reduce((m, r) => (r.cost < m.cost ? r : m), results[0]);
  const pick = results
    .filter((r) => r.cost <= best.cost * 1.04 + 0.5)
    .sort((x, y) => x.fixes.length - y.fixes.length || x.cost - y.cost)[0];
  return { fixes: pick.fixes, tested: results.length, results, baseline: results[0], chosen: pick };
}
