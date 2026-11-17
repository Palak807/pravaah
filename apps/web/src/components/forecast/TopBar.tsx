import { fmt, DAY_START, DAY_END } from '@nabz/engine';
import { useStoreShallow } from '../../store';
import { plural, hrs } from './helpers';

export function TopBar() {
  const s = useStoreShallow((st) => ({
    base: st.base,
    plan: st.plan,
    hasPlan: st.hasPlan,
    view: st.view,
    viewT: st.viewT,
    now: st.now,
    playing: st.playing,
    guided: st.guided,
    play: st.play,
    pause: st.pause,
    skipToNextEvent: st.skipToNextEvent,
    setView: st.setView,
    setViewT: st.setViewT,
    takeControl: st.takeControl,
    setGuided: st.setGuided,
    setToolsOpen: st.setToolsOpen,
    go: st.go,
  }));
  const cur = s.view === 'plan' && s.hasPlan ? s.plan : s.base;
  const m = cur.metrics;

  let verdict: string;
  let verdictClass = '';
  if (m.cancelCount) {
    verdict = `By tonight: ${plural(m.cancelCount, 'surgery', 'surgeries')} cancelled`;
    verdictClass = 'bad';
  } else if (m.boardHours > 3) {
    verdict = `By tonight: emergency patients wait ${hrs(m.boardHours)} h for a bed`;
    verdictClass = 'warn';
  } else {
    verdict = 'Today looks manageable';
    verdictClass = 'good';
  }

  const onPlay = () => (s.playing ? s.pause() : s.play());
  const onScrub = (v: number) => {
    s.takeControl();
    s.setViewT(v);
  };

  return (
    <div className="topbar">
      <div className="topbar-row">
        <button className={'play' + (s.playing ? ' on' : '')} aria-label={s.playing ? 'Pause' : 'Play'} onClick={onPlay}>
          {s.playing ? '❚❚' : '▶'}
        </button>
        <button className="play skip" aria-label="Skip to the next thing that happens" title="Skip to the next thing that happens" onClick={s.skipToNextEvent} disabled={s.viewT >= DAY_END}>
          ⏭
        </button>
        <span className={'bigclock' + (s.viewT > s.now ? ' fut' : '')}>{fmt(s.viewT)}</span>

        <span className={'verdict ' + verdictClass}>{verdict}</span>

        <div className="topbar-right">
          <div className="seg" role="group" aria-label="Which day">
            <button aria-pressed={s.view === 'base'} onClick={() => s.setView('base')}>
              As things stand
            </button>
            <button className="fut" aria-pressed={s.view === 'plan'} disabled={!s.hasPlan} title={s.hasPlan ? undefined : 'Test a plan first'} onClick={() => s.setView('plan')}>
              With plan
            </button>
          </div>
          {s.guided ? (
            <button className="btn small" onClick={s.takeControl} title="Stop the guided walkthrough and explore yourself">
              Take control
            </button>
          ) : (
            <button className="btn small" onClick={() => s.setGuided(true)}>
              Guide me
            </button>
          )}
          <button className="btn small future" onClick={() => s.setToolsOpen(true)}>
            What can we do?
          </button>
          <button className="btn small primary" onClick={() => s.go(4)}>
            Discharge list →
          </button>
        </div>
      </div>

      <div className="topbar-scrub">
        <span className="scrub-now">8am</span>
        <input
          type="range"
          min={DAY_START}
          max={DAY_END}
          step={5}
          value={s.viewT}
          aria-label="Time of day"
          onChange={(e) => onScrub(parseInt(e.target.value, 10))}
        />
        <span className="scrub-now">9pm</span>
      </div>
    </div>
  );
}
