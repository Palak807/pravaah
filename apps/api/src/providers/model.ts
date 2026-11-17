/* ModelProvider — a real LLM assistant (Claude) grounded in the simulation engine.

   Claude never invents numbers: it answers with tools that run the digital twin
   (run_plan, find_best_plan). The tool results are computed by @nabz/engine, so
   "every number on screen is computed by the simulation" still holds. If the model
   or key is unavailable, it falls back to the scripted provider so the app never breaks. */

import Anthropic from '@anthropic-ai/sdk';
import { fmt, FIXES, type FixId, type Shock, type ShockType } from '@nabz/engine';
import { env } from '../env.js';
import { scriptedProvider, lang } from './scripted.js';
import type { AssistantProvider, AskContext, Answer, Reading, ReadInput, DischargeRow, TheatreCase } from './types.js';

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

function dischargeOrder(ctx: AskContext): string {
  const dis = ctx.base.dis;
  if (!dis.length) return '';
  // Pair the engine's discharge patients with the real names/beds read off the register.
  const idMap: Record<string, DischargeRow> = {};
  const ocr = ctx.discharges;
  if (ocr && ocr.length) {
    const byBed = [...dis].sort((a, b) => a.bed - b.bed);
    const ocrByBed = [...ocr].sort((a, b) => a.bed - b.bed);
    byBed.forEach((d, i) => {
      if (ocrByBed[i]) idMap[d.id] = ocrByBed[i];
    });
  }
  const rows = dis
    .map((d) => {
      const who = idMap[d.id];
      return { name: who?.name ?? null, bed: who?.bed ?? d.bed, insured: who ? who.insured : d.insured, free: d.tBedFree };
    })
    .sort((a, b) => (a.free == null ? 99999 : a.free) - (b.free == null ? 99999 : b.free));
  const lines = rows.map(
    (r, i) => `${i + 1}. ${r.name ? r.name + ', ' : ''}bed ${r.bed} (${r.insured ? 'insured' : 'cash'}) — bed forecast free ${r.free == null ? 'after 21:00' : fmt(r.free)}`,
  );
  return `\nThe patients fit to go home today, ordered by when their bed is forecast to come free (discharge the top ones first):\n${lines.join('\n')}\n`;
}

const SYSTEM = (ctx: AskContext) => `You are Pravaah, the assistant inside a hospital bed-flow tool for a small ${ctx.cfg.wardBeds ?? 24}-bed nursing home.

The hospital is a chain: discharge paperwork frees ward beds; free ward beds let intensive-care patients move down; free intensive-care beds let surgery patients recover after theatre. When discharges are slow the ward stays full, intensive care cannot offload, and surgeries that need an intensive-care bed afterwards get cancelled.

${situation(ctx)}
${dischargeOrder(ctx)}
You can change today in five ways ("fixes") and test them on a digital twin:
${FIXES.map((f) => `- "${f.id}": ${f.name} — ${f.what}`).join('\n')}

You can also test "shocks": "accident" (6 emergency patients arrive; give an "at" minute-of-day), "insuranceSlow" (insurance desk short-staffed), "roundsLate" (doctors' rounds run an hour late).

RULES:
- NEVER invent numbers. To say what a plan or shock would do, call the run_plan or find_best_plan tool and use the numbers it returns. The current situation above is already computed and you may quote it directly.
- run_plan is only a PREVIEW. It does NOT change today's forecast on screen; the numbers on screen stay as they are. So describe a what-if conditionally — "if a road accident brought 6 patients at 11:00, the forecast would show…" — never "I added that to today".
- When a question involves MORE THAN ONE change at once (e.g. an accident AND a slow insurance desk), put all of them in the "shocks" array of a SINGLE run_plan call so they are tested together. Do not test them in separate calls and then describe them as combined.
- Your reply appears in a small chat bubble. Reply in PLAIN TEXT only — 2 to 4 short sentences. Absolutely NO markdown: no asterisks, no **bold**, no backticks, no headings, no bullet or numbered lists. Write times as plain text like 10:00.
- Reply in the SAME language as the question: English, Hindi (Devanagari), or Hinglish (romanised Hindi).
- When you recommend a plan, name the fix(es) in plain words and say what changes (e.g. how many cancellations are avoided and when beds come free).
- When asked who to discharge first or next, name the SPECIFIC patient(s) and bed(s) from the discharge list above (e.g. "Start with Rani in bed 24, then …") — never answer with just a count like "the 8 patients".
- Refer to surgeries and patients only by the names given above — never invent or use any other case names.
- NEVER mention tools, tool calls, functions, JSON, the API, the model, or any internal mechanism, and never say whether you did or did not need to "run" or "call" anything. Just answer with the facts and the forecast, as a knowledgeable colleague would.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_plan',
    description:
      'Preview one scenario on the digital twin: a chosen set of fixes together with any number of shocks, all applied AT THE SAME TIME, and return the resulting metrics. To test two or more shocks happening together, pass them both in the "shocks" array of a SINGLE call — do not make separate calls.',
    input_schema: {
      type: 'object',
      properties: {
        fixes: { type: 'array', items: { type: 'string', enum: FIX_IDS }, description: 'Which fixes to apply (may be empty for "no change").' },
        shocks: {
          type: 'array',
          description: 'Shocks to apply together in this one scenario. Include every shock the question asks about in the same array.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['accident', 'insuranceSlow', 'roundsLate'] },
              at: { type: 'number', description: 'For an accident, the minute-of-day it happens (e.g. 660 = 11:00).' },
            },
            required: ['type'],
          },
        },
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
    const input = (rawInput ?? {}) as {
      fixes?: string[];
      shocks?: { type?: ShockType; at?: number }[];
      // legacy single-shock shape, still tolerated:
      shockType?: ShockType;
      shockAt?: number;
    };
    if (name === 'run_plan') {
      const fixes = (input.fixes ?? []).filter((f): f is FixId => (FIX_IDS as string[]).includes(f));
      const rawShocks = input.shocks ?? (input.shockType ? [{ type: input.shockType, at: input.shockAt }] : []);
      const shocks: Shock[] = rawShocks
        .filter((s): s is { type: ShockType; at?: number } => !!s && !!s.type)
        .map((s) => ({ type: s.type, at: s.type === 'accident' ? (s.at ?? ctx.now + 90) : ctx.now }));
      const m = ctx.run(fixes, shocks).metrics;
      const shockLabel = shocks.map((s) => s.type).join(' + ');
      const label = (fixes.length ? fixes.join(' + ') : 'no change') + (shocks.length ? ` + ${shockLabel}` : '');
      out.tests.push(`${label}: ${m.cancelCount} cancelled, beds free ${fmt(m.avgBedFree)}`);
      if (fixes.length) tested.push(fixes);
      if (shocks.length) out.shock = shocks[0];
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

Read them and extract the following. Reply with ONLY a JSON object, no prose, no markdown:
{
  "wardBeds": <total ward beds>,
  "wardOccupied": <ward beds occupied this morning>,
  "icuBeds": <total ICU beds>,
  "icuOccupied": <ICU beds occupied>,
  "fitForDischarge": <number of patients marked fit to go home / "d/c" / "छुट्टी" today>,
  "insured": <how many of those are insured / "TPA">,
  "stepDowns": [<minute-of-day each ICU patient is marked ready for the ward, e.g. 10:00 -> 600>],
  "plannedAdmissions": [<minute-of-day each afternoon admission is due, e.g. 13:35 -> 815>],
  "discharges": [<one object PER PATIENT marked fit to go home on the ward register: {"bed": <ward bed number>, "name": "<patient name>", "insured": <true if marked TPA/insured, else false>}>],
  "theatres": [<one object PER surgery on the OT list: {"name": "<procedure name>", "icu": <true if the case needs an ICU bed afterwards, else false>}>]
}
Rules: Times are minutes from midnight (HH*60+MM). "discharges" must list the actual patients (read their real names and bed numbers); its length should equal "fitForDischarge". "theatres" must list the actual procedures by name. If something is not legible, make your best estimate from context. Return every field.`;

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}
function toMinutes(arr: unknown, fallback: number[]): number[] {
  if (!Array.isArray(arr)) return fallback;
  const out = arr.map((x) => (typeof x === 'number' ? x : parseInt(String(x), 10))).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440);
  return out.length ? out : fallback;
}
/** Bed labels are often written like "W-03", "Bed 5" or "12"; pull the number out. */
function toBed(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = String(v ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function toDischarges(arr: unknown, wardBeds: number): DischargeRow[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const rows = arr
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const bed = toBed(o.bed);
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      return { bed: bed > 0 ? Math.min(wardBeds, bed) : 0, name, insured: !!o.insured };
    })
    .filter((r) => r.name.length > 0);
  return rows.length ? rows : undefined;
}
function toTheatres(arr: unknown): TheatreCase[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const rows = arr
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      return { name, icu: !!o.icu };
    })
    .filter((r) => r.name.length > 0);
  return rows.length ? rows : undefined;
}
function normalizeReading(j: Record<string, unknown>): Reading {
  const wardBeds = Math.max(4, Math.min(60, toNum(j.wardBeds, SAMPLE.wardBeds)));
  const icuBeds = Math.max(1, Math.min(30, toNum(j.icuBeds, SAMPLE.icuBeds)));
  const discharges = toDischarges(j.discharges, wardBeds);
  // If the model listed the actual patients, trust that count for fitForDischarge.
  const fit = Math.max(0, Math.min(wardBeds, discharges ? discharges.length : toNum(j.fitForDischarge, SAMPLE.fitForDischarge)));
  const insuredCount = discharges ? discharges.filter((d) => d.insured).length : toNum(j.insured, SAMPLE.insured);
  return {
    wardBeds,
    wardOccupied: Math.max(0, Math.min(wardBeds, toNum(j.wardOccupied, SAMPLE.wardOccupied))),
    icuBeds,
    icuOccupied: Math.max(0, Math.min(icuBeds, toNum(j.icuOccupied, SAMPLE.icuOccupied))),
    fitForDischarge: fit,
    insured: Math.max(0, Math.min(fit, insuredCount)),
    stepDowns: toMinutes(j.stepDowns, SAMPLE.stepDowns),
    plannedAdmissions: toMinutes(j.plannedAdmissions, SAMPLE.plannedAdmissions),
    discharges,
    theatres: toTheatres(j.theatres),
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
      const resp = await client.messages.create({ model: env.anthropicModel, max_tokens: 1500, messages: [{ role: 'user', content }] });
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
