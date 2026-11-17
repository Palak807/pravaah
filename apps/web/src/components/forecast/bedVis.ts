import type { Snapshot } from '@nabz/engine';
import { STAGE } from './helpers';

export interface Vis {
  cls: string;
  word: string;
}
export function wardVis(b: Snapshot['ward'][number]): Vis {
  if (b.st === 'free') return { cls: 'b-free', word: 'free' };
  if (b.st === 'dirty') return { cls: 'b-dirty', word: 'to clean' };
  if (b.st === 'clean') return { cls: 'b-clean', word: 'cleaning' };
  if (b.kind === 'ready') return { cls: 'b-ready', word: STAGE[b.stage ?? ''] || 'fit' };
  if (b.kind === 'surg') return { cls: 'b-surg', word: 'surgery' };
  if (b.kind === 'new') return { cls: 'b-new', word: 'new' };
  return { cls: 'b-occ', word: '' };
}
export function icuVis(b: Snapshot['icu'][number]): Vis {
  if (b.st === 'free') return { cls: 'b-free', word: 'free' };
  if (b.st === 'clean') return { cls: 'b-clean', word: 'cleaning' };
  if (b.st === 'res') return { cls: 'b-res', word: 'held' };
  if (b.blocked != null) return { cls: 'b-jam', word: 'stuck' };
  if (b.kind === 'postop') return { cls: 'b-new', word: 'post-op' };
  return { cls: 'b-occ', word: '' };
}
export function edVis(p: Snapshot['ed'][number]): Vis {
  if (!p) return { cls: 'b-free', word: 'free' };
  if (p.board != null) return { cls: 'b-jam', word: p.board + ' min' };
  return { cls: 'b-treat', word: '' };
}
