import { useEffect, useRef } from 'react';
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

  snapshotRef.current = snapshot;

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    const stage = new MiraStage();
    stageRef.current = stage;

    void stage.mount(host, overlay).then(() => {
      if (stageRef.current !== stage) return;
      const pending = snapshotRef.current;
      if (pending) stage.update(pending);
    });

    return () => {
      stage.destroy();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !stageRef.current?.ready) return;
    stageRef.current.update(snapshot);
  }, [snapshot]);

  return (
    <div className="stage-wrap">
      <div ref={hostRef} className="stage-canvas" />
      <div ref={overlayRef} className="stage-overlay" />
    </div>
  );
}
