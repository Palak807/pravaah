import { useStoreShallow } from '../../store';
import { type ReadNumbers } from '../../sim';

const SLOT = ['Bed register', 'Theatre list', 'ICU board & admissions'];

function StepRow({
  label,
  hint,
  k,
  min,
  max,
}: {
  label: string;
  hint: string;
  k: keyof ReadNumbers;
  min: number;
  max: number;
}) {
  const { value, changeNumber } = useStoreShallow((s) => ({ value: s.numbers[k] as number, changeNumber: s.changeNumber }));
  return (
    <div className="readrow">
      <div>
        {label}
        <small>{hint}</small>
      </div>
      <div className="stepper">
        <button aria-label={`One fewer: ${label}`} onClick={() => changeNumber(k, -1, min, max)}>
          −
        </button>
        <span className="num">{value}</span>
        <button aria-label={`One more: ${label}`} onClick={() => changeNumber(k, +1, min, max)}>
          +
        </button>
      </div>
    </div>
  );
}

function FixedRow({ label, hint, val }: { label: string; hint: string; val: number | string }) {
  return (
    <div className="readrow fixed">
      <div>
        {label}
        <small>{hint}</small>
      </div>
      <span className="num">{val}</span>
    </div>
  );
}

export function CheckScreen() {
  const { numbers, flagYes, slots, setFlag, toForecast } = useStoreShallow((s) => ({
    numbers: s.numbers,
    flagYes: s.flagYes,
    slots: s.slots,
    setFlag: s.setFlag,
    toForecast: s.toForecast,
  }));

  return (
    <div className="check">
      <section>
        <h1>Here is what I read. Is it right?</h1>
        <p className="lede">Change anything I got wrong. The forecast uses these numbers, so a wrong bed count means a wrong forecast.</p>
        <div className="shots-mini" style={{ marginTop: 22 }}>
          {[0, 1, 2].map((i) => (
            <figure className="shot-mini" key={i}>
              {slots[i] ? <img alt={SLOT[i]} src={slots[i] as string} /> : <div className="shot-ph" />}
              <figcaption>{SLOT[i]}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section>
        <div className="readlist">
          <StepRow label="Ward beds" hint="From the bed register" k="wardBeds" min={16} max={32} />
          <StepRow label="Ward beds occupied this morning" hint="From the bed register" k="wardOccupied" min={10} max={numbers.wardBeds} />
          <StepRow label="Patients fit to go home today" hint={'Rows marked "fit for d/c" or "छुट्टी"'} k="fitForDischarge" min={0} max={12} />
          <StepRow label="Of those, insured" hint="Rows marked &quot;TPA&quot;. Insured discharges take longer." k="insured" min={0} max={numbers.fitForDischarge} />
          <FixedRow label="Surgeries today" hint="2 of them need an ICU bed afterwards. From the theatre list." val={7} />
          <FixedRow label="ICU beds, all occupied" hint="2 patients are ready for the ward, at 10:00 and 10:45. From the ICU board." val={numbers.icuBeds} />
          <FixedRow label="Admissions due this afternoon" hint="Between 13:35 and 16:15. From the ICU board page." val={numbers.plannedAdmissions.length} />
          <div className="readrow ask">
            <div>
              <b>One discharge was hard to read.</b> I wasn't fully sure about one row and counted it as fit to go home. Is the count above right?
              <div className="choice">
                <button className="btn small" aria-pressed={flagYes} onClick={() => setFlag(true)}>
                  Yes, fit to go home
                </button>
                <button className="btn small" aria-pressed={!flagYes} onClick={() => setFlag(false)}>
                  No, staying today
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="intro-actions">
          <button className="btn primary" onClick={toForecast}>
            Looks right. Forecast today
          </button>
        </div>
      </section>
    </div>
  );
}
