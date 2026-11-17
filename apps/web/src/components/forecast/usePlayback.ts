import { useEffect } from 'react';
import { DAY_END } from '@nabz/engine';
import { useStore } from '../../store';
import { snapAt } from '../../sim';

/** sim-minutes advanced per real second — one legible pace: the full 13-hour day
    plays in about two and a half minutes, so staff can watch it unfold. */
const RATE = 5;

function hasJam(lv: Record<string, number>): boolean {
  return Object.values(lv).some((v) => v === 2);
}

/** Drives the playback clock with requestAnimationFrame while `playing` is true. */
export function usePlayback() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = RATE;

    const loop = (now: number) => {
      const s = useStore.getState();
      const dt = (now - last) / 1000;
      last = now;
      const prevT = s.viewT;
      let t = prevT + dt * rate;

      const cur = s.view === 'plan' && s.hasPlan ? s.plan : s.base;

      // Guided mode always pauses at each new jam (with an on-screen explanation).
      if (s.pauseOnJam || s.guided) {
        const prevSnap = snapAt(cur, prevT);
        const nextSnap = snapAt(cur, t);
        if (nextSnap.t > s.now && hasJam(nextSnap.lv) && !hasJam(prevSnap.lv)) {
          s.setViewT(nextSnap.t);
          s.pause();
          return;
        }
      }

      if (t >= DAY_END) {
        s.setViewT(DAY_END);
        s.pause();
        return;
      }
      s.setViewT(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
