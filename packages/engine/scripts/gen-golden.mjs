/* Generate golden fixtures from the ORIGINAL legacy engine, so the TS port can be
   proven bit-identical. Run with: pnpm --filter @nabz/engine gen:golden */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { simulateScenarios, riskScenarios, bestPlanScenarios, liteResult } from './scenarios.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const legacyPath = resolve(here, '../../../legacy/js/engine.js');
const E = require(legacyPath);

const jsonSafe = (x) => JSON.parse(JSON.stringify(x));

const golden = {
  generatedFrom: 'legacy/js/engine.js',
  simulate: simulateScenarios.map((s) => ({
    name: s.name,
    expect: jsonSafe(liteResult(E.simulate(s.cfg, s.opts))),
  })),
  risk: riskScenarios.map((s) => ({
    name: s.name,
    expect: jsonSafe(E.risk(s.cfg, s.opts, s.n)),
  })),
  bestPlan: bestPlanScenarios.map((s) => {
    const r = E.bestPlan ? E.bestPlan(s.cfg, s.opts) : E.findBestPlan(s.cfg, s.opts);
    return { name: s.name, expect: jsonSafe({ fixes: r.fixes, tested: r.tested, results: r.results, baseline: r.baseline, chosen: r.chosen }) };
  }),
};

const outDir = resolve(here, '../src/__tests__');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'golden.json');
writeFileSync(outPath, JSON.stringify(golden, null, 2));
console.log('Wrote golden fixtures ->', outPath);
console.log(`  simulate: ${golden.simulate.length}, risk: ${golden.risk.length}, bestPlan: ${golden.bestPlan.length}`);
