/* Minute-of-day -> "HH:MM". Ported verbatim from legacy/js/engine.js. */
export function fmt(t: number | null | undefined): string {
  if (t == null) return '';
  t = Math.round(t);
  const h = Math.floor(t / 60),
    m = t % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
