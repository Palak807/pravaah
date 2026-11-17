import type { FastifyInstance } from 'fastify';
import { simulate, findBestPlan, type FixId, type Shock, type SimulateOpts } from '@nabz/engine';
import { getAssistant } from '../providers/index.js';
import type { AskContext } from '../providers/types.js';
import { askBody, readBody } from '../validation.js';

const toObj = (ids: FixId[]): Partial<Record<FixId, boolean>> => {
  const o: Partial<Record<FixId, boolean>> = {};
  ids.forEach((i) => (o[i] = true));
  return o;
};
function anyDone(done: Record<string, Record<string, boolean>>): boolean {
  for (const k in done) for (const j in done[k]) if (done[k][j]) return true;
  return false;
}

export async function assistantRoutes(app: FastifyInstance) {
  const assistant = getAssistant();

  app.post('/api/assistant/read', async (req) => {
    const { photoRefs, images } = readBody.parse(req.body);
    const numbers = await assistant.read({ photoRefs, images });
    return { provider: assistant.name, numbers };
  });

  app.post('/api/assistant/ask', async (req) => {
    const body = askBody.parse(req.body);
    const cfg = body.cfg;
    const now = body.now ?? 510;
    const seed = body.seed ?? 'day-2';
    const shocks: Shock[] = body.shocks ?? [];
    const fixes = (body.fixes ?? {}) as Partial<Record<FixId, boolean>>;
    const done = body.done ?? {};

    const baseOpts: SimulateOpts = { seed, now, shocks };
    const base = simulate(cfg, baseOpts);
    const hasPlan = Object.keys(fixes).length > 0 || anyDone(done);
    const plan = hasPlan ? simulate(cfg, { ...baseOpts, fixes, done }) : base;

    const ctx: AskContext = {
      base,
      plan,
      hasPlan,
      fixes,
      cfg: cfg ?? {},
      now,
      run: (ids, extra) => simulate(cfg, { ...baseOpts, fixes: toObj(ids ?? []), shocks: shocks.concat(extra ?? []) }),
      best: (cb) => findBestPlan(cfg, baseOpts, cb),
    };

    const answer = await assistant.ask(body.text, ctx);
    return { provider: assistant.name, answer };
  });
}
