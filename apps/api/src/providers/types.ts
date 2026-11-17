/* The AssistantProvider boundary.

   Today only ScriptedProvider exists — a faithful port of legacy/js/assistant.js:
   read() returns the sample day's numbers, ask() keyword-matches an intent and renders
   a bilingual answer whose every number comes from the engine.

   To make it real later, implement this same interface with a model (e.g. Sarvam for
   Indian-language OCR + chat) and switch ASSISTANT_PROVIDER=model. No route changes. */

import type {
  Config,
  FixId,
  Shock,
  SimulationResult,
  BestPlanResult,
  PlanTestResult,
} from '@nabz/engine';

/** A patient marked fit to go home, read off the ward register. */
export interface DischargeRow {
  bed: number;
  name: string;
  insured: boolean;
}

/** A surgery on the theatre (OT) list. */
export interface TheatreCase {
  name: string;
  icu: boolean;
}

/** Numbers read off the three register photos. */
export interface Reading {
  wardBeds: number;
  wardOccupied: number;
  icuBeds: number;
  icuOccupied: number;
  fitForDischarge: number;
  insured: number;
  stepDowns: number[];
  plannedAdmissions: number[];
  /** The actual patients marked fit to go home (names + beds from the ward register). */
  discharges?: DischargeRow[];
  /** The actual surgeries on the theatre list. */
  theatres?: TheatreCase[];
}

export interface ReadInput {
  /** Opaque references to uploaded photos; ignored by the scripted provider. */
  photoRefs?: unknown;
  /** Uploaded register photos as data URLs (data:image/...;base64,...). Used for real OCR. */
  images?: string[];
}

/** Context handed to ask(): the already-run day plus closures to run more. */
export interface AskContext {
  base: SimulationResult;
  plan: SimulationResult;
  hasPlan: boolean;
  fixes: Partial<Record<FixId, boolean>>;
  cfg: Partial<Config>;
  now: number;
  /** The real patients fit to go home (names + beds), when the photo was read. */
  discharges?: DischargeRow[];
  run(ids?: FixId[], extra?: Shock[]): SimulationResult;
  best(cb?: (r: PlanTestResult) => void): BestPlanResult;
}

export interface Answer {
  lang: 'en' | 'hi' | 'hing';
  tests: string[];
  text: string;
  plan: FixId[] | null;
  shock: Shock | null;
}

export interface AssistantProvider {
  name: string;
  read(input: ReadInput): Promise<Reading> | Reading;
  ask(text: string, ctx: AskContext): Promise<Answer> | Answer;
}
