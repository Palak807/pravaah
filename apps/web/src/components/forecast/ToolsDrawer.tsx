import { useState } from 'react';
import { useStoreShallow } from '../../store';
import { AskTab, TestPlanTab } from './SidePanel';
import { NumbersTable } from './NumbersTable';

type DrawerTab = 'ask' | 'plan' | 'numbers';

export function ToolsDrawer() {
  const { setToolsOpen, go } = useStoreShallow((s) => ({ setToolsOpen: s.setToolsOpen, go: s.go }));
  const [tab, setTab] = useState<DrawerTab>('ask');

  return (
    <div className="drawer-backdrop" onClick={() => setToolsOpen(false)}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What can we do?">
        <div className="drawer-head">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>
              Ask Pravaah
            </button>
            <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>
              Test a plan
            </button>
            <button role="tab" aria-selected={tab === 'numbers'} onClick={() => setTab('numbers')}>
              By tonight
            </button>
          </div>
          <button className="btn small" onClick={() => setToolsOpen(false)}>
            Close
          </button>
        </div>
        <div className="pane">
          {tab === 'ask' && <AskTab />}
          {tab === 'plan' && <TestPlanTab />}
          {tab === 'numbers' && <NumbersTable />}
        </div>
        <div className="sidefoot">
          <button
            className="btn primary"
            onClick={() => {
              setToolsOpen(false);
              go(4);
            }}
          >
            Make today's discharge list
          </button>
        </div>
      </div>
    </div>
  );
}
