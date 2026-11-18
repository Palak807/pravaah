import { useStoreShallow } from '../store';
import { STEPS } from '../sim';

export function Header() {
  const { step, maxStep, go } = useStoreShallow((s) => ({ step: s.step, maxStep: s.maxStep, go: s.go }));
  return (
    <header className="top">
      <div className="brand">
        <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
          <polyline
            points="1,14 9,14 12,5 17,22 21,10 24,14 33,14"
            fill="none"
            stroke="#FFD866"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <b className="wordmark">प्रवाह</b>
        <span>Sunrise Nursing Home, 30 beds</span>
      </div>
      <nav className="steps" id="steps" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              aria-current={n === step ? 'step' : undefined}
              disabled={n > maxStep}
              className={n < step ? 'done' : undefined}
              onClick={() => go(n)}
            >
              <i>{n}</i>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div
        className="demo"
        title="The hospital, patients and registers are invented. The assistant runs on Claude, and every number is computed by the simulation."
      >
        Sample data
      </div>
    </header>
  );
}
