import { useEffect, useRef, useState } from 'react';
import { FIXES, type FixId } from '@nabz/engine';
import { useStoreShallow, type ChatBot } from '../../store';

const TRIES = ['ICU kab full hoga?', 'What should we do today?', 'अगर डिस्चार्ज राउंड सुबह कर दें तो?', 'What if a road accident brings 6 patients at 11?'];

/** The model is told to reply in plain text, but if any markdown slips through we
    render **bold** properly and strip stray markers rather than show raw asterisks. */
function renderRich(text: string) {
  const clean = text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*]\s+/gm, '• '); // bullets -> dot
  return clean.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{part.replace(/[*_]{1,3}/g, '')}</span>;
  });
}

export function AskTab() {
  const { chat, ask, usePlan } = useStoreShallow((s) => ({ chat: s.chat, ask: s.ask, usePlan: s.usePlan }));
  const [text, setText] = useState('');
  const msgsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(text);
    setText('');
  };

  return (
    <>
      <div className="msgs" id="msgs" ref={msgsRef}>
        {chat.length === 0 && <div className="msg a">Ask me about today in English, Hindi or Hinglish. I run your question on the twin before I answer.</div>}
        {chat.map((m, i) => {
          if (m.who === 'u') return <div className="msg u" key={i}>{m.text}</div>;
          const bot = m as ChatBot;
          const tests = bot.tests.slice(0, bot.shown);
          return (
            <div className="msg a" key={i}>
              {tests.length > 0 && (
                <ul className="tests">
                  {tests.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              )}
              {bot.ready ? (
                <>
                  {renderRich(bot.text)}
                  {bot.plan && bot.plan.length > 0 && (
                    <button className="btn small future" onClick={() => usePlan(bot.plan as FixId[])}>
                      Show this plan on the floor
                    </button>
                  )}
                </>
              ) : (
                <i>Running it on the twin</i>
              )}
            </div>
          );
        })}
      </div>
      <div className="tries">
        {TRIES.map((t) => (
          <button key={t} onClick={() => ask(t)}>
            {t}
          </button>
        ))}
      </div>
      <form className="askbar" onSubmit={submit}>
        <input
          autoComplete="off"
          placeholder="Type a question, in any language"
          aria-label="Question for Pravaah"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn future">Ask</button>
      </form>
    </>
  );
}

export function TestPlanTab() {
  const { fixes, status, busy, toggleFix, findBest, clearPlan } = useStoreShallow((s) => ({
    fixes: s.fixes,
    status: s.status,
    busy: s.busy,
    toggleFix: s.toggleFix,
    findBest: s.findBest,
    clearPlan: s.clearPlan,
  }));
  return (
    <>
      <p style={{ margin: '0 0 4px' }}>Tick what you could do today. The twin reruns the day at once.</p>
      {FIXES.map((x) => (
        <label className="fix" key={x.id}>
          <input type="checkbox" checked={!!fixes[x.id]} onChange={(e) => toggleFix(x.id as FixId, e.target.checked)} />
          <b>{x.name}</b>
          <small>{x.what}</small>
        </label>
      ))}
      <p className="status" aria-live="polite">
        {status}
      </p>
      <div className="planfoot">
        <button className="btn future" disabled={busy} onClick={() => findBest()}>
          {busy ? 'Testing…' : 'Find the best plan'}
        </button>
        <button className="btn" disabled={Object.keys(fixes).length === 0} onClick={clearPlan}>
          Clear the plan
        </button>
      </div>
    </>
  );
}

export function SidePanel() {
  const { tab, setTab, go } = useStoreShallow((s) => ({ tab: s.tab, setTab: s.setTab, go: s.go }));
  return (
    <aside className="side" id="side">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>
          Ask Pravaah
        </button>
        <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>
          Test a plan
        </button>
      </div>
      <div className="pane">{tab === 'ask' ? <AskTab /> : <TestPlanTab />}</div>
      <div className="sidefoot">
        <button className="btn primary" onClick={() => go(4)}>
          Make today's discharge list
        </button>
      </div>
    </aside>
  );
}
