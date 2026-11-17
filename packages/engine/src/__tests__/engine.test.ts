import { describe, it, expect } from 'vitest';
import { simulate, risk, findBestPlan } from '../index.js';
// Shared scenario matrix (plain JS, no types).
import {
  simulateScenarios,
  riskScenarios,
  bestPlanScenarios,
  liteResult,
  // @ts-expect-error — .mjs has no type declarations; treated as any.
} from '../../scripts/scenarios.mjs';
import golden from './golden.json';

const jsonSafe = <T>(x: T): T => JSON.parse(JSON.stringify(x));

interface Scenario {
  name: string;
  cfg?: unknown;
  opts?: unknown;
  n?: number;
}

describe('engine parity with legacy/js/engine.js', () => {
  describe('simulate()', () => {
    (simulateScenarios as Scenario[]).forEach((s, i) => {
      it(s.name, () => {
        const actual = jsonSafe(liteResult(simulate(s.cfg as never, s.opts as never)));
        expect(actual).toEqual(golden.simulate[i].expect);
      });
    });
  });

  describe('risk()', () => {
    (riskScenarios as Scenario[]).forEach((s, i) => {
      it(s.name, () => {
        const actual = jsonSafe(risk(s.cfg as never, s.opts as never, s.n));
        expect(actual).toEqual(golden.risk[i].expect);
      });
    });
  });

  describe('findBestPlan()', () => {
    (bestPlanScenarios as Scenario[]).forEach((s, i) => {
      it(s.name, () => {
        const r = findBestPlan(s.cfg as never, s.opts as never);
        const actual = jsonSafe({
          fixes: r.fixes,
          tested: r.tested,
          results: r.results,
          baseline: r.baseline,
          chosen: r.chosen,
        });
        expect(actual).toEqual(golden.bestPlan[i].expect);
      });
    });
  });
});
