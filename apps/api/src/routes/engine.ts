import type { FastifyInstance } from 'fastify';
import { simulate, risk, findBestPlan } from '@nabz/engine';
import { simulateBody, riskBody, bestPlanBody } from '../validation.js';

/** Engine wrappers. The browser runs single simulations locally for instant scrubbing;
    these exist for authoritative runs and the heavy Monte-Carlo jobs (risk / best-plan). */
export async function engineRoutes(app: FastifyInstance) {
  app.post('/api/simulate', async (req) => {
    const { cfg, opts } = simulateBody.parse(req.body);
    return simulate(cfg, opts);
  });

  app.post('/api/risk', async (req) => {
    const { cfg, opts, n } = riskBody.parse(req.body);
    return risk(cfg, opts, n);
  });

  app.post('/api/best-plan', async (req) => {
    const { cfg, opts } = bestPlanBody.parse(req.body);
    return findBestPlan(cfg, opts);
  });
}
