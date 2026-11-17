import { useEffect, useRef } from 'react';
import { useStoreShallow } from '../../store';
import { TopBar } from './TopBar';
import { FlowBoard } from './FlowBoard';
import { NarrationPanel } from './NarrationPanel';
import { ToolsDrawer } from './ToolsDrawer';
import { usePlayback } from './usePlayback';

export function TodayScreen() {
  usePlayback();
  const { guided, playing, viewT, now, toolsOpen, play } = useStoreShallow((s) => ({
    guided: s.guided,
    playing: s.playing,
    viewT: s.viewT,
    now: s.now,
    toolsOpen: s.toolsOpen,
    play: s.play,
  }));

  // Guided mode: auto-start the walkthrough once when the screen first opens.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (guided && !playing && viewT <= now) {
      const id = setTimeout(() => play(), 600);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="today">
      <TopBar />
      <div className="today-main">
        <FlowBoard />
        <NarrationPanel />
      </div>
      {toolsOpen && <ToolsDrawer />}
    </div>
  );
}
