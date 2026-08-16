import { useEffect, useRef, useState } from 'react';
import type { RuntimeSnapshot } from '@miratown/core';
import { MiraStage } from '../renderer/MiraStage';

interface StageViewProps {
  snapshot: RuntimeSnapshot | null;
}

export function StageView({ snapshot }: StageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<MiraStage | null>(null);
  const snapshotRef = useRef<RuntimeSnapshot | null>(null);
  const [stageReady, setStageReady] = useState(false);

  snapshotRef.current = snapshot;

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    let alive = true;
    const stage = new MiraStage();
    stageRef.current = stage;

    void stage.mount(host, overlay).then(() => {
      if (!alive || stageRef.current !== stage) return;
      setStageReady(true);
      const pending = snapshotRef.current;
      if (pending) stage.update(pending);
    });

    return () => {
      alive = false;
      setStageReady(false);
      stage.destroy();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !stageReady || !stageRef.current) return;
    stageRef.current.update(snapshot);
  }, [snapshot, stageReady]);

  return (
    <div className="stage-wrap">
      <div ref={hostRef} className="stage-canvas" />
      <div ref={overlayRef} className="stage-overlay" />
    </div>
  );
}
