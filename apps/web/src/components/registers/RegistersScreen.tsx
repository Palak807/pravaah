import { useState } from 'react';
import { useStoreShallow } from '../../store';

const SLOT = ['Bed register', 'Theatre list', 'ICU board & admissions'];

/** The three demo register photos bundled with the app (served from /public/samples). */
const SAMPLES = ['/samples/ward.png', '/samples/ot.png', '/samples/icu.png'];

/** Downscale a chosen photo to keep the upload small and OCR fast. */
function downscale(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(rd.error);
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(rd.result as string);
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(rd.result as string);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = rd.result as string;
    };
    rd.readAsDataURL(file);
  });
}

export function RegistersScreen() {
  const { slots, reading, readDone, found, setSlot, readRegisters, go } = useStoreShallow((s) => ({
    slots: s.slots,
    reading: s.reading,
    readDone: s.readDone,
    found: s.found,
    setSlot: s.setSlot,
    readRegisters: s.readRegisters,
    go: s.go,
  }));

  const [loadingSamples, setLoadingSamples] = useState(false);
  const all = slots.every((x) => x);

  const onFile = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await downscale(file);
    setSlot(i, dataUrl);
  };

  /* Load the bundled demo photos into all three slots, so the same OCR runs on them. */
  const useSamples = async () => {
    setLoadingSamples(true);
    try {
      for (let i = 0; i < SAMPLES.length; i++) {
        const res = await fetch(SAMPLES[i]);
        const blob = await res.blob();
        const file = new File([blob], `sample-${i}.png`, { type: blob.type || 'image/png' });
        const dataUrl = await downscale(file);
        setSlot(i, dataUrl);
      }
    } catch (e) {
      console.warn('[samples] could not load demo photos', e);
    } finally {
      setLoadingSamples(false);
    }
  };

  return (
    <>
      <section className="intro">
        <h1>Good morning. Show me today's registers.</h1>
        <p className="lede">
          Photograph the three pages you already keep on paper. प्रवाह reads them, forecasts where beds will jam today, and tells you what to do first.
        </p>
        <div className="intro-actions">
          {readDone ? (
            <button className="btn primary" onClick={() => go(2)}>
              Check what I read
            </button>
          ) : (
            all && (
              <button className="btn primary" disabled={reading} onClick={() => readRegisters()}>
                {reading ? 'Reading the registers…' : 'Read these registers'}
              </button>
            )
          )}
          {!all && !reading && !readDone && (
            <>
              <button className="btn" disabled={loadingSamples} onClick={useSamples}>
                {loadingSamples ? 'Loading sample photos…' : 'Use sample photos'}
              </button>
              <span className="lede" style={{ margin: 0, fontSize: 15 }}>
                No registers handy? Load our three sample pages, or add your own photos.
              </span>
            </>
          )}
        </div>
      </section>
      <div className="papers">
        {[0, 1, 2].map((i) => {
          const v = slots[i];
          return (
            <div className="paper-wrap" id={`pw${i}`} key={i}>
              {!v ? (
                <div className="slot">
                  <div>
                    <h3>{SLOT[i]}</h3>
                    <p>No photo yet</p>
                    <label className="btn small">
                      Take or choose a photo
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(i, e)} />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="slot shot" style={{ borderStyle: 'solid' }}>
                  <img alt={`Your photo of the ${SLOT[i].toLowerCase()}`} src={v} />
                  {reading && found[i].length === 0 && <div className="scan" />}
                  {readDone && (
                    <label className="reshoot">
                      Replace
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(i, e)} />
                    </label>
                  )}
                </div>
              )}
              <ul className="found" aria-live="polite">
                {found[i].map((x, k) => (
                  <li key={k}>{x}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
