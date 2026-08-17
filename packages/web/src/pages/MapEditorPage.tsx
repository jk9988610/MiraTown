import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildMapExportDocument,
  loadEmbeddedCatalog,
  serializeMapExport,
  snapStraightEndpoint,
  snapWorldCoord,
  validateStraightWalkway,
  type MapObjectDef,
  type WalkwayDef,
} from '@miratown/core';

type Tool = 'select' | 'walkway' | 'object';

interface EditorWalkway extends WalkwayDef {
  points: [{ x: number; y: number }, { x: number; y: number }];
}

interface EditorObject extends MapObjectDef {}

const PX = 14;

function worldToCanvas(
  x: number,
  y: number,
  mapH: number,
  offsetX: number,
  offsetY: number,
): { cx: number; cy: number } {
  return {
    cx: offsetX + x * PX,
    cy: offsetY + (mapH - y) * PX,
  };
}

function canvasToWorld(
  cx: number,
  cy: number,
  mapH: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  return {
    x: snapWorldCoord((cx - offsetX) / PX),
    y: snapWorldCoord(mapH - (cy - offsetY) / PX),
  };
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MapEditorPage() {
  const catalog = useMemo(() => loadEmbeddedCatalog(), []);
  const scenes = useMemo(() => [...catalog.scenes.values()], [catalog]);
  const placeableProps = useMemo(
    () => [...catalog.props.values()].filter((p) => p.placeable),
    [catalog],
  );

  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? 'plaza');
  const scene = catalog.scenes.get(sceneId);
  const mapW = scene?.width ?? 64;
  const mapH = scene?.height ?? 48;

  const [tool, setTool] = useState<Tool>('walkway');
  const [walkways, setWalkways] = useState<EditorWalkway[]>([]);
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [propType, setPropType] = useState(placeableProps[0]?.id ?? 'bench');
  const [propState, setPropState] = useState(placeableProps[0]?.states[0] ?? 'empty');
  const [walkWidth, setWalkWidth] = useState(1.2);
  const [walkDraft, setWalkDraft] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offset = useMemo(() => ({ x: 40, y: 24 }), []);

  const sceneWalkways = walkways.filter((w) => w.scene === sceneId);
  const sceneObjects = objects.filter((o) => o.scene === sceneId);

  const propDef = catalog.props.get(propType);
  useEffect(() => {
    if (propDef && !propDef.states.includes(propState)) {
      setPropState(propDef.states[0] ?? 'empty');
    }
  }, [propDef, propState]);

  const nextId = useCallback(
    (prefix: string) => {
      const all = [...walkways.map((w) => w.id), ...objects.map((o) => o.id)];
      let n = 1;
      while (all.includes(`${prefix}_${n}`)) n++;
      return `${prefix}_${n}`;
    },
    [walkways, objects],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = mapW * PX + offset.x * 2;
    const ch = mapH * PX + offset.y * 2;
    canvas.width = cw;
    canvas.height = ch;

    ctx.fillStyle = '#1a2830';
    ctx.fillRect(0, 0, cw, ch);

    for (let tx = 0; tx < mapW; tx++) {
      for (let ty = 0; ty < mapH; ty++) {
        const wx = tx + 0.5;
        const wy = mapH - ty - 0.5;
        const { cx, cy } = worldToCanvas(wx, wy, mapH, offset.x, offset.y);
        ctx.fillStyle = (tx + ty) % 2 === 0 ? '#2d4a3e' : '#264038';
        ctx.fillRect(cx - PX / 2, cy - PX / 2, PX, PX);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (const w of sceneWalkways) {
      const [a, b] = w.points;
      const pa = worldToCanvas(a.x, a.y, mapH, offset.x, offset.y);
      const pb = worldToCanvas(b.x, b.y, mapH, offset.x, offset.y);
      const sel = selectedId === w.id;
      ctx.strokeStyle = sel ? '#7ec8ff' : 'rgba(120, 200, 160, 0.85)';
      ctx.lineWidth = w.width * PX;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pa.cx, pa.cy);
      ctx.lineTo(pb.cx, pb.cy);
      ctx.stroke();
      ctx.fillStyle = sel ? '#7ec8ff' : '#a8e6cf';
      ctx.font = '11px sans-serif';
      ctx.fillText(w.id, (pa.cx + pb.cx) / 2, (pa.cy + pb.cy) / 2 - 6);
    }

    if (walkDraft && hover && tool === 'walkway') {
      const end = snapStraightEndpoint(walkDraft, hover);
      const pa = worldToCanvas(walkDraft.x, walkDraft.y, mapH, offset.x, offset.y);
      const pb = worldToCanvas(end.x, end.y, mapH, offset.x, offset.y);
      ctx.strokeStyle = 'rgba(255, 230, 120, 0.7)';
      ctx.lineWidth = walkWidth * PX;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pa.cx, pa.cy);
      ctx.lineTo(pb.cx, pb.cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const obj of sceneObjects) {
      const def = catalog.props.get(obj.prop);
      const w = (def?.width ?? 1) * PX;
      const h = (def?.height ?? 1) * PX;
      const { cx, cy } = worldToCanvas(obj.x, obj.y, mapH, offset.x, offset.y);
      const sel = selectedId === obj.id;
      ctx.fillStyle = sel ? 'rgba(126, 200, 255, 0.55)' : 'rgba(90, 120, 150, 0.55)';
      ctx.strokeStyle = sel ? '#7ec8ff' : '#8aa0b0';
      ctx.lineWidth = 2;
      ctx.fillRect(cx - w / 2, cy - h, w, h);
      ctx.strokeRect(cx - w / 2, cy - h, w, h);
      ctx.fillStyle = '#e8f0f8';
      ctx.font = '10px sans-serif';
      ctx.fillText(obj.id, cx - w / 2, cy - h - 4);
      ctx.fillText(obj.prop, cx - w / 2, cy - h + 12);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Y↑北（画面上方）', 8, 14);
    ctx.fillText(`${scene.display_name} ${mapW}×${mapH} wu`, 8, ch - 8);
  }, [
    catalog,
    hover,
    mapH,
    mapW,
    objects,
    offset.x,
    offset.y,
    scene,
    sceneId,
    sceneObjects,
    sceneWalkways,
    selectedId,
    tool,
    walkDraft,
    walkWidth,
    walkways,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const hitTest = (wx: number, wy: number): string | null => {
    for (const obj of sceneObjects) {
      const def = catalog.props.get(obj.prop);
      const hw = (def?.width ?? 1) / 2;
      const hh = def?.height ?? 1;
      if (wx >= obj.x - hw && wx <= obj.x + hw && wy >= obj.y - hh && wy <= obj.y) {
        return obj.id;
      }
    }
    for (const w of sceneWalkways) {
      const [a, b] = w.points;
      const minX = Math.min(a.x, b.x) - w.width / 2;
      const maxX = Math.max(a.x, b.x) + w.width / 2;
      const minY = Math.min(a.y, b.y) - w.width / 2;
      const maxY = Math.max(a.y, b.y) + w.width / 2;
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return w.id;
    }
    return null;
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, mapH, offset.x, offset.y);

    if (tool === 'select') {
      setSelectedId(hitTest(x, y));
      return;
    }

    if (tool === 'object' && propDef) {
      const id = nextId(propType.replace(/[^a-z0-9_]/gi, '') || 'obj');
      setObjects((prev) => [
        ...prev,
        { id, scene: sceneId, prop: propType, x, y, state: propState },
      ]);
      setSelectedId(id);
      return;
    }

    if (tool === 'walkway') {
      if (!walkDraft) {
        setWalkDraft({ x, y });
        return;
      }
      const end = snapStraightEndpoint(walkDraft, { x, y });
      const err = validateStraightWalkway([walkDraft, end]);
      if (err) {
        alert(err);
        setWalkDraft(null);
        return;
      }
      const id = nextId(`${sceneId}_walk`);
      setWalkways((prev) => [
        ...prev,
        {
          id,
          scene: sceneId,
          points: [walkDraft, end],
          width: walkWidth,
          visible_default: true,
        },
      ]);
      setWalkDraft(null);
      setSelectedId(id);
    }
  };

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(canvasToWorld(e.clientX - rect.left, e.clientY - rect.top, mapH, offset.x, offset.y));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setWalkways((prev) => prev.filter((w) => w.id !== selectedId));
    setObjects((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') setWalkDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportMap = () => {
    const usedScenes = new Set([
      ...walkways.map((w) => w.scene),
      ...objects.map((o) => o.scene),
    ]);
    const doc = buildMapExportDocument({
      catalog_version: catalog.catalog_version,
      scenes: scenes.filter((s) => usedScenes.has(s.id)),
      walkways,
      map_objects: objects,
    });
    downloadText('miratown-map-export.yaml', serializeMapExport(doc));
  };

  return (
    <div className="map-editor">
      <header className="map-editor-header">
        <div>
          <h1>米拉小镇 · 地图编辑器</h1>
          <p className="subtitle">绘制直道人行道、摆放建筑与物件，导出 YAML 融入项目</p>
        </div>
        <div className="actions">
          <Link to="/" className="btn-link">
            返回播放
          </Link>
          <button type="button" className="primary" onClick={exportMap}>
            导出 miratown-map-export.yaml
          </button>
        </div>
      </header>

      <div className="map-editor-body">
        <aside className="map-editor-panel">
          <section>
            <h3>场景</h3>
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name} ({s.width}×{s.height})
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3>工具</h3>
            <div className="tool-row">
              <button
                type="button"
                className={tool === 'walkway' ? 'active' : ''}
                onClick={() => {
                  setTool('walkway');
                  setWalkDraft(null);
                }}
              >
                直道人行道
              </button>
              <button
                type="button"
                className={tool === 'object' ? 'active' : ''}
                onClick={() => setTool('object')}
              >
                摆放物件
              </button>
              <button
                type="button"
                className={tool === 'select' ? 'active' : ''}
                onClick={() => setTool('select')}
              >
                选择/删除
              </button>
            </div>
            {tool === 'walkway' && (
              <label className="field">
                道宽 (wu)
                <input
                  type="number"
                  step="0.1"
                  min="0.4"
                  value={walkWidth}
                  onChange={(e) => setWalkWidth(Number(e.target.value))}
                />
              </label>
            )}
            {tool === 'object' && (
              <>
                <label className="field">
                  物件类型
                  <select value={propType} onChange={(e) => setPropType(e.target.value)}>
                    {placeableProps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} ({p.id})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  状态
                  <select value={propState} onChange={(e) => setPropState(e.target.value)}>
                    {(propDef?.states ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <p className="hint">
              人行道：点击起点 → 点击终点（自动收成水平/竖直直线）。Del 删除选中。Y 向上为北。
            </p>
          </section>

          <section>
            <h3>本场景内容</h3>
            <ul className="map-item-list">
              {sceneWalkways.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className={selectedId === w.id ? 'sel' : ''}
                    onClick={() => setSelectedId(w.id)}
                  >
                    🛤 {w.id}
                  </button>
                </li>
              ))}
              {sceneObjects.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={selectedId === o.id ? 'sel' : ''}
                    onClick={() => setSelectedId(o.id)}
                  >
                    📦 {o.id} ({o.prop})
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="map-editor-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="map-editor-canvas"
            onClick={onCanvasClick}
            onMouseMove={onCanvasMove}
            onMouseLeave={() => setHover(null)}
          />
        </main>
      </div>
    </div>
  );
}
