import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const app = buildServer();
afterAll(() => app.close());

describe('API routes (no DB)', () => {
  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('POST /api/simulate returns snaps + metrics', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { opts: { seed: 'day-2', now: 510 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.snaps)).toBe(true);
    expect(body.snaps.length).toBeGreaterThan(0);
    expect(body.metrics).toHaveProperty('cancelCount');
  });

  it('POST /api/assistant/read returns the sample numbers', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/assistant/read', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().numbers).toMatchObject({ wardBeds: 24, fitForDischarge: 9, insured: 6 });
  });

  it('POST /api/assistant/ask answers a "what should we do" question with a plan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { text: 'What should we do today?', seed: 'day-2', now: 510 },
    });
    expect(res.statusCode).toBe(200);
    const { answer } = res.json();
    expect(answer.lang).toBe('en');
    expect(typeof answer.text).toBe('string');
    expect(answer.text.length).toBeGreaterThan(10);
    expect(Array.isArray(answer.tests)).toBe(true);
  });

  it('POST /api/assistant/ask detects an accident shock', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { text: 'What if a road accident brings 6 patients at 11?', seed: 'day-2', now: 510 },
    });
    const { answer } = res.json();
    expect(answer.shock).toMatchObject({ type: 'accident' });
  });

  it('POST /api/assistant/ask answers Hindi in Hindi', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { text: 'ICU कब फुल होगा?', seed: 'day-2', now: 510 },
    });
    expect(res.json().answer.lang).toBe('hi');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/assistant/ask', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
