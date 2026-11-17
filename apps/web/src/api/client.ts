/* Thin API client. Same-origin: dev proxies /api to the API server, prod serves via nginx.
   Heavy jobs (best-plan) and the assistant go to the server; single simulations run locally. */
import type { Config, SimulateOpts, BestPlanResult, FixId, Shock } from '@nabz/engine';
import type { ReadNumbers } from '../sim';

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}
async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export interface AskAnswer {
  lang: 'en' | 'hi' | 'hing';
  tests: string[];
  text: string;
  plan: FixId[] | null;
  shock: Shock | null;
}

export const api = {
  readRegisters(images: string[]) {
    return post<{ provider: string; numbers: ReadNumbers }>('/api/assistant/read', { images });
  },

  ask(params: {
    text: string;
    cfg?: Partial<Config>;
    seed?: string;
    now?: number;
    fixes?: Record<string, boolean>;
    done?: Record<string, Record<string, boolean>>;
    shocks?: Shock[];
  }) {
    return post<{ provider: string; answer: AskAnswer }>('/api/assistant/ask', params);
  },

  bestPlan(cfg: Partial<Config>, opts: SimulateOpts) {
    return post<BestPlanResult>('/api/best-plan', { cfg, opts });
  },

  createReading(numbers: ReadNumbers, photoRefs?: unknown) {
    return post<{ id: string }>('/api/readings', { numbers, photoRefs });
  },
  createDay(body: { readingId: string; seed?: string; fixes?: Record<string, boolean>; done?: unknown; shocks?: Shock[] }) {
    return post<{ id: string }>('/api/days', body);
  },
  updateDay(id: string, body: { seed?: string; fixes?: Record<string, boolean>; done?: unknown; shocks?: Shock[] }) {
    return patch<{ id: string }>(`/api/days/${id}`, body);
  },

  contact(body: { name: string; email: string; message: string; website?: string }) {
    return post<{ ok: true }>('/api/contact', body);
  },
};

