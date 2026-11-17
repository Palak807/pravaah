import type { Snapshot, DeptKey } from '@nabz/engine';

export const LV = ['Calm', 'Strained', 'Jammed'];

export function plural(n: number, one: string, many: string): string {
  return n + ' ' + (n === 1 ? one : many);
}
export function hrs(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

export const STAGE: Record<string, string> = {
  wait: 'no order',
  sumQ: 'summary',
  sum: 'summary',
  billQ: 'bill',
  bill: 'bill',
  billed: 'bill',
  appr: 'insurer',
  pack: 'leaving',
};

export function deptLine(k: DeptKey, s: Snapshot): string {
  const n = s.n;
  let cancelledSoFar = 0;
  let heldName: string | null = null;
  s.th.forEach((l) =>
    l.forEach((c) => {
      if (c.status === 'cancelled') cancelledSoFar++;
      if (c.status === 'held') heldName = c.name;
    }),
  );
  if (k === 'ed') return n.board ? plural(n.board, 'patient waiting', 'patients waiting') + ' for a ward bed' : n.busyBays + ' of ' + s.ed.length + ' bays in use';
  if (k === 'icu') return n.sd ? plural(n.sd, 'patient ready', 'patients ready') + ' for the ward, no bed to move to' : n.icuFree ? n.icuFree + ' free' : 'No free bed';
  if (k === 'ward') return n.free === 0 ? '0 free' + (n.board + n.sd + n.plan ? ', ' + (n.board + n.sd + n.plan) + ' waiting for a bed' : '') : n.free + ' free';
  if (k === 'th') return heldName ? heldName + ' held, no ICU bed for afterwards' : cancelledSoFar ? plural(cancelledSoFar, 'surgery', 'surgeries') + ' cancelled' : 'Running to plan';
  return n.stillInBed
    ? n.stillInBed + ' fit to go home, still in bed' + (n.notOrdered ? ', ' + n.notOrdered + ' with no discharge order yet' : '')
    : 'Everyone fit to go has left their bed';
}
