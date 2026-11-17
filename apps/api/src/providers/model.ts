/* ModelProvider — a real LLM assistant (Claude) grounded in the simulation engine.

   Claude never invents numbers: it answers with tools that run the digital twin
   (run_plan, find_best_plan). The tool results are computed by @nabz/engine, so
   "every number on screen is computed by the simulation" still holds. If the model
   or key is unavailable, it falls back to the scripted provider so the app never breaks. */

import Anthropic from '@anthropic-ai/sdk';
import { fmt, FIXES, type FixId, type Shock, type ShockType } from '@nabz/engine';
import { env } from '../env.js';
import { scriptedProvider, lang } from './scripted.js';
import type { AssistantProvider, AskContext, Answer, Reading, ReadInput } from './types.js';

const FIX_IDS = FIXES.map((f) => f.id);
const h1 = (x: number) => (Math.round(x * 10) / 10).toString();

function situation(ctx: AskContext): string {
  const m = ctx.base.metrics;
  const fit = ctx.base.dis.length;
  const cancelled = m.cancelled.map((c) => `${c.name} at ${fmt(c.at)}`).join(', ') || 'none';
  const firstJam = m.firstJam ? `${m.firstJam.dept} at ${fmt(m.firstJam.t)}` : 'none before 21:00';
  return [
    `It is ${fmt(ctx.now)}. Today's forecast, as things stand:`,
    `- Surgeries cancelled: ${m.cancelCount} (${cancelled}).`,
    `- Patients fit to go home still occupying beds this morning: ${fit}.`,
    `- Hours emergency patients wait for a ward bed: ${h1(m.boardHours)}.`,
    `- Hours intensive-care patients are stuck waiting for a ward bed: ${h1(m.blockedHours)}.`,
    `- Average time a bed comes free: ${fmt(m.avgBedFree)}.`,
    `- Planned admissions put off to tomorrow: ${m.putOff}.`,
    `- First department to jam: ${firstJam}.`,
  ].join('\n');
}

const SYSTEM = (ctx: AskContext) => `You are Pravaah, the assistant inside a hospital bed-flow tool for a small ${ctx.cfg.wardBeds ?? 24}-bed nursing home.

The hospital is a chain: discharge paperwork frees ward beds; free ward beds let intensive-care patients move down; free intensive-care beds let surgery patients recover after theatre. When discharges are slow the ward stays full, intensive care cannot offload, and surgeries that need an intensive-care bed afterwards get cancelled.

${situation(ctx)}

You can change today in five ways ("fixes") and test them on a digital twin:
${FIXES.map((f) => `- "${f.id}": ${f.name} — ${f.what}`).join('\n')}

You can also test "shocks": "accident" (6 emergency patients arrive; give an "at" minute-of-day), "insuranceSlow" (insurance desk short-staffed), "roundsLate" (doctors' rounds run an hour late).

RULES:
- NEVER invent numbers. To say what a plan or shock would do, call the run_plan or find_best_plan tool and use the numbers it returns. The current situation above is already computed and you may quote it directly.
- Your reply appears in a small chat bubble. Reply in PLAIN PROSE only — 2 to 4 short sentences. NO markdown tables, NO headings, NO bullet lists, NO bold.
- Reply in the SAME language as the question: English, Hindi (Devanagari), or Hinglish (romanised Hindi).
- When you recommend a plan, name the fix(es) in plain words and say what changes (e.g. how many cancellations are avoided and when beds come free).`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_plan',
    description: 'Run the day on the digital twin with a chosen set of fixes (and optionally a shock) and return the resulting metrics.',
    input_schema: {
      type: 'object',
      properties: {
        fixes: { type: 'array', items: { type: 'string', enum: FIX_IDS }, description: 'Which fixes to apply (may be empty for "no change").' },
        shockType: { type: 'string', enum: ['accident', 'insuranceSlow', 'roundsLate'], description: 'Optional shock to add to the day.' },
        shockAt: { type: 'number', description: 'For an accident, the minute-of-day it happens (e.g. 660 = 11:00).' },
      },
      required: ['fixes'],
    },
  },
  {
    name: 'find_best_plan',
    description: 'Ask the twin to test many combinations of fixes and return the cheapest plan that avoids the most cancellations, with before/after metrics.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

function metricsOut(label: string, mm: AskContext['base']['metrics']) {
  return {
    plan: label,
    surgeriesCancelled: mm.cancelCount,
    cancelledCases: mm.cancelled.map((c) => `${c.name} (${fmt(c.at)})`),
    emergencyWaitHours: Math.round(mm.boardHours * 10) / 10,
    icuBlockedHours: Math.round(mm.blockedHours * 10) / 10,
    avgBedFree: fmt(mm.avgBedFree),
    admissionsPutOff: mm.putOff,
  };
}

async function askModel(text: string, ctx: AskContext): Promise<Answer> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const out: Answer = { lang: lang(text), tests: [], text: '', plan: null, shock: null };
  const tested: FixId[][] = []; // non-empty plans tested via run_plan
  let bestPlan: FixId[] | null = null; // from find_best_plan

  const exec = (name: string, rawInput: unknown): unknown => {
    const input = (rawInput ?? {}) as { fixes?: string[]; shockType?: ShockType; shockAt?: number };
    if (name === 'run_plan') {
      const fixes = (input.fixes ?? []).filter((f): f is FixId => (FIX_IDS as string[]).includes(f));
      const shock: Shock | undefined = input.shockType
        ? { type: input.shockType, at: input.shockType === 'accident' ? (input.shockAt ?? ctx.now + 90) : ctx.now }
        : undefined;
      const m = ctx.run(fixes, shock ? [shock] : []).metrics;
      const label = (fixes.length ? fixes.join(' + ') : 'no change') + (shock ? ` + ${shock.type}` : '');
      out.tests.push(`${label}: ${m.cancelCount} cancelled, beds free ${fmt(m.avgBedFree)}`);
      if (fixes.length) tested.push(fixes);
      if (shock) out.shock = shock;
      return { ...metricsOut(label, m), baseline: metricsOut('as things stand', ctx.base.metrics) };
    }
    if (name === 'find_best_plan') {
      const b = ctx.best();
      const pr = ctx.run(b.fixes).metrics;
      out.tests.push(`${b.fixes.join(' + ') || 'no change'}: ${pr.cancelCount} cancelled, beds free ${fmt(pr.avgBedFree)} (tested ${b.tested} plans)`);
      if (b.fixes.length) bestPlan = b.fixes;
      return { bestFixes: b.fixes, plansTested: b.tested, result: metricsOut('best plan', pr), baseline: metricsOut('as things stand', ctx.base.metrics) };
    }
    return { error: 'unknown tool' };
  };

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];
  const system = SYSTEM(ctx);

  for (let i = 0; i < 5; i++) {
    const resp = await client.messages.create({ model: env.anthropicModel, max_tokens: 1024, system, tools: TOOLS, messages });
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'tool_use' && toolUses.length) {
      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(exec(tu.name, tu.input)),
      }));
      messages.push({ role: 'user', content: results });
      continue;
    }
    out.text = textBlocks.trim();
    break;
  }
  // Only surface a "show this plan" when it's unambiguous: the best plan, or the
  // single plan that was tested. When several were compared, let the text speak.
  out.plan = bestPlan ?? (tested.length === 1 ? tested[0] : null);
  if (!out.text) out.text = 'Sorry — I could not complete that. Please try rephrasing.';
  return out;
}

const SAMPLE = scriptedProvider.read({}) as Reading;

const OCR_PROMPT = `These are photos of a small hospital's three paper registers for today:
1) the general WARD bed register, 2) the operating-theatre (OT) list, 3) the ICU board with the afternoon admissions list.

Read them and extract these numbers. Reply with ONLY a JSON object, no prose, no markdown:
{
  "wardBeds": <total ward beds>,
  "wardOccupied": <ward beds occupied this morning>,
  "icuBeds": <total ICU beds>,
  "icuOccupied": <ICU beds occupied>,
  "fitForDischarge": <patients marked fit to go home / "d/c" / "छुट्टी" today>,
  "insured": <how many of those are insured / "TPA">,
  "stepDowns": [<minute-of-day each ICU patient is marked ready for the ward, e.g. 10:00 -> 600>],
  "plannedAdmissions": [<minute-of-day each afternoon admission is due, e.g. 13:35 -> 815>]
}
Times are minutes from midnight (HH*60+MM). If a value is not legible, make your best estimate from context. Return every field.`;

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}
function toMinutes(arr: unknown, fallback: number[]): number[] {
  if (!Array.isArray(arr)) return fallback;
  const out = arr.map((x) => (typeof x === 'number' ? x : parseInt(String(x), 10))).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440);
  return out.length ? out : fallback;
}
function normalizeReading(j: Record<string, unknown>): Reading {
  const wardBeds = Math.max(4, Math.min(60, toNum(j.wardBeds, SAMPLE.wardBeds)));
  const icuBeds = Math.max(1, Math.min(30, toNum(j.icuBeds, SAMPLE.icuBeds)));
  const fit = Math.max(0, Math.min(wardBeds, toNum(j.fitForDischarge, SAMPLE.fitForDischarge)));
  return {
    wardBeds,
    wardOccupied: Math.max(0, Math.min(wardBeds, toNum(j.wardOccupied, SAMPLE.wardOccupied))),
    icuBeds,
    icuOccupied: Math.max(0, Math.min(icuBeds, toNum(j.icuOccupied, SAMPLE.icuOccupied))),
    fitForDischarge: fit,
    insured: Math.max(0, Math.min(fit, toNum(j.insured, SAMPLE.insured))),
    stepDowns: toMinutes(j.stepDowns, SAMPLE.stepDowns),
    plannedAdmissions: toMinutes(j.plannedAdmissions, SAMPLE.plannedAdmissions),
  };
}
function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in model reply');
  return JSON.parse(text.slice(start, end + 1));
}

export const modelProvider: AssistantProvider = {
  name: 'model',
  // Real OCR of uploaded register photos via Claude vision; sample day if no images.
  async read(input: ReadInput): Promise<Reading> {
    const imgs = (input.images ?? []).filter((s) => typeof s === 'string' && s.startsWith('data:'));
    if (!imgs.length) return SAMPLE;
    try {
      const client = new Anthropic({ apiKey: env.anthropicApiKey });
      const content: Anthropic.ContentBlockParam[] = imgs.slice(0, 3).map((d) => {
        const comma = d.indexOf(',');
        const meta = d.slice(0, comma);
        const data = d.slice(comma + 1);
        const mt = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
        return { type: 'image', source: { type: 'base64', media_type: mt as 'image/jpeg', data } };
      });
      content.push({ type: 'text', text: OCR_PROMPT });
      const resp = await client.messages.create({ model: env.anthropicModel, max_tokens: 700, messages: [{ role: 'user', content }] });
      const txt = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      return normalizeReading(extractJson(txt));
    } catch (e) {
      console.warn('[assistant:model] OCR failed, using sample numbers:', (e as Error)?.message);
      return SAMPLE;
    }
  },
  async ask(text: string, ctx: AskContext): Promise<Answer> {
    try {
      return await askModel(text, ctx);
    } catch (e) {
      console.warn('[assistant:model] falling back to scripted:', (e as Error)?.message);
      return scriptedProvider.ask(text, ctx);
    }
  },
};
