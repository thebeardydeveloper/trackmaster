"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../sim/track";
import type { Instruction, RaceResult } from "../sim/types";
import { newId } from "../game/format";
import { ACTION_META, defaultAction } from "./NodeEditor";

const W = 1000;
const H = 150;
const PAD_L = 34;
const PAD_R = 10;
const SPEED_TOP = 52;
const SPEED_BOTTOM = 128;
const MAX_KMH = 340;

interface Drag {
  id: string;
  mode: "move" | "resize";
  /** Time under the pointer when the drag started. */
  startT: number;
  t0: number;
  d0: number;
  /** Time scale frozen during the drag so the axis doesn't move under the pointer. */
  maxT: number;
  moved: boolean;
}

const snap = (t: number, fine: boolean) => {
  const q = fine ? 0.01 : 0.05;
  return Number((Math.round(t / q) * q).toFixed(2));
};

/**
 * Time axis with the nodes and, if there was a previous run, its speed curve and the
 * moments the car was in each corner. Hover to read time / speed / distance.
 * Nodes can be dragged in time; steer bars can be stretched from their right edge;
 * double-click adds a node.
 */
export function Timeline({
  track,
  nodes,
  result,
  compare = null,
  compareLabel,
  selectedId,
  onSelect,
  onChange,
  disabled = false,
}: {
  track: Track;
  nodes: Instruction[];
  result: RaceResult | null;
  /** Second run (the ghost) drawn as a dashed speed curve for comparison. */
  compare?: RaceResult | null;
  compareLabel?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange?: (nodes: Instruction[]) => void;
  disabled?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // handlers read the ref: pointer events can arrive before React re-renders
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const autoMaxT = useMemo(() => {
    let m = 10;
    for (const n of nodes) m = Math.max(m, n.t + (n.action.type === "steer" ? n.action.duration : 0) + 1);
    if (result) m = Math.max(m, result.frames[result.frames.length - 1].t);
    if (compare) m = Math.max(m, compare.frames[compare.frames.length - 1].t);
    return Math.ceil(m * 1.05);
  }, [nodes, result, compare]);
  const maxT = drag ? drag.maxT : autoMaxT;

  const pointer = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const scale = dragRef.current?.maxT ?? maxT;
    return { t: ((px - PAD_L) / (W - PAD_L - PAD_R)) * scale, y: ((e.clientY - r.top) / r.height) * H };
  };

  // latest props for the window listeners of an ongoing drag
  const latest = useRef({ nodes, onChange });
  useEffect(() => {
    latest.current = { nodes, onChange };
  });

  const applyDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    const { nodes: cur, onChange: change } = latest.current;
    if (!d || !change) return;
    const delta = pointer(e).t - d.startT;
    if (!d.moved && Math.abs(delta) < d.maxT * 0.003) return;
    const fine = e.altKey || e.shiftKey;
    change(
      cur.map((n) => {
        if (n.id !== d.id) return n;
        if (d.mode === "move") return { ...n, t: Math.max(0, snap(d.t0 + delta, fine)) };
        if (n.action.type !== "steer") return n;
        return { ...n, action: { ...n.action, duration: Math.max(0.05, snap(d.d0 + delta, fine)) } };
      }),
    );
    if (!d.moved) setDrag({ ...d, moved: true });
  };

  const startDrag = (e: React.PointerEvent, n: Instruction, mode: Drag["mode"]) => {
    e.stopPropagation();
    onSelect(n.id);
    if (disabled || !onChange || e.button !== 0) return;
    e.preventDefault(); // no text selection / native drag
    setDrag({
      id: n.id,
      mode,
      startT: pointer(e).t,
      t0: n.t,
      d0: n.action.type === "steer" ? n.action.duration : 0,
      maxT,
      moved: false,
    });
    // follow the pointer anywhere on the page until it's released
    const move = (ev: PointerEvent) => applyDrag(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const dragged = drag ? nodes.find((n) => n.id === drag.id) : undefined;

  const x = (t: number) => PAD_L + (t / maxT) * (W - PAD_L - PAD_R);
  const ySpeed = (kmh: number) => SPEED_BOTTOM - (kmh / MAX_KMH) * (SPEED_BOTTOM - SPEED_TOP);

  const pathOf = (r: RaceResult | null) =>
    r
      ? r.frames
          .filter((_, k) => k % 3 === 0)
          .map((f, k) => `${k ? "L" : "M"}${x(f.t).toFixed(1)},${ySpeed(f.speed * 3.6).toFixed(1)}`)
          .join("")
      : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const speedPath = useMemo(() => pathOf(result), [result, maxT]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const comparePath = useMemo(() => pathOf(compare), [compare, maxT]);

  const cornerBands = useMemo(() => {
    if (!result) return [];
    return track.corners.map((c) => {
      let t0: number | null = null;
      let t1: number | null = null;
      for (const f of result.frames) {
        if (f.progress >= c.sStart && t0 === null) t0 = f.t;
        if (f.progress >= c.sEnd) {
          t1 = f.t;
          break;
        }
      }
      return t0 === null ? null : { c, t0, t1: t1 ?? result.frames[result.frames.length - 1].t };
    });
  }, [result, track]);

  const hoverFrame = useMemo(() => {
    if (!result || hoverT === null) return null;
    return result.frames.find((f) => f.t >= hoverT) ?? result.frames[result.frames.length - 1];
  }, [result, hoverT]);

  const step = maxT > 60 ? 10 : maxT > 25 ? 5 : maxT > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= maxT; t += step) ticks.push(t);

  const steerNodes = nodes.filter((n) => n.action.type === "steer");
  // overlapping steer orders in the same lane get stacked in sub-rows so each one stays grabbable
  const steerLayout = useMemo(() => {
    const out = new Map<string, { row: number; rows: number }>();
    for (const side of ["left", "right"] as const) {
      const lane = nodes
        .filter((n) => n.action.type === "steer" && n.action.side === side)
        .sort((a, b) => a.t - b.t);
      const rowEnds: number[] = [];
      const rowOf = new Map<string, number>();
      for (const n of lane) {
        const end = n.t + (n.action.type === "steer" ? n.action.duration : 0);
        let r = rowEnds.findIndex((e) => e <= n.t);
        if (r < 0) {
          r = rowEnds.length;
          rowEnds.push(end);
        } else rowEnds[r] = end;
        rowOf.set(n.id, r);
      }
      for (const [id, row] of rowOf) out.set(id, { row, rows: Math.max(1, rowEnds.length) });
    }
    return out;
  }, [nodes]);
  const otherNodes = nodes.filter((n) => n.action.type !== "steer");

  return (
    <div className="relative select-none">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"

        className={`h-[150px] w-full ${drag ? "cursor-grabbing" : ""}`}
        onPointerMove={(e) => {
          const { t } = pointer(e);
          setHoverT(t >= 0 && t <= maxT ? t : null);
        }}
        onPointerLeave={() => !dragRef.current && setHoverT(null)}
        onDoubleClick={(e) => {
          if (disabled || !onChange) return;
          const { t, y } = pointer(e);
          if (t < 0 || t > maxT) return;
          const at = Math.round(t * 10) / 10;
          const node: Instruction =
            y < 36
              ? { id: newId(), t: at, action: { ...(defaultAction("steer") as Extract<Instruction["action"], { type: "steer" }>), side: y < 19 ? "left" : "right" } }
              : { id: newId(), t: at, action: defaultAction("accelerate") };
          onChange([...nodes, node]);
          onSelect(node.id);
        }}
      >
        {/* corner bands from the last run */}
        {cornerBands.map(
          (b) =>
            b && (
              <g key={b.c.index} pointerEvents="none">
                <rect x={x(b.t0)} y={SPEED_TOP - 6} width={Math.max(1, x(b.t1) - x(b.t0))} height={SPEED_BOTTOM - SPEED_TOP + 6} fill="#ffffff" opacity={0.06} />
                <text x={x(b.t0) + 2} y={SPEED_TOP - 8} fontSize={10} fill="#ffffff" opacity={0.55}>
                  T{b.c.index + 1}
                </text>
              </g>
            ),
        )}
        {/* speed grid */}
        {[100, 200, 300].map((k) => (
          <g key={k}>
            <line x1={PAD_L} x2={W - PAD_R} y1={ySpeed(k)} y2={ySpeed(k)} stroke="#fff" opacity={0.07} />
            <text x={4} y={ySpeed(k) + 3} fontSize={9} fill="#fff" opacity={0.35}>
              {k}
            </text>
          </g>
        ))}
        {/* time axis */}
        <line x1={PAD_L} x2={W - PAD_R} y1={SPEED_BOTTOM} y2={SPEED_BOTTOM} stroke="#fff" opacity={0.25} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={SPEED_BOTTOM} y2={SPEED_BOTTOM + 4} stroke="#fff" opacity={0.4} />
            <text x={x(t)} y={SPEED_BOTTOM + 15} fontSize={10} fill="#fff" opacity={0.5} textAnchor="middle">
              {t}s
            </text>
          </g>
        ))}
        {comparePath && (
          <path pointerEvents="none" d={comparePath} fill="none" stroke="#7dd3fc" strokeWidth={1.3} strokeDasharray="5 4" opacity={0.8} vectorEffect="non-scaling-stroke" />
        )}
        {speedPath && <path pointerEvents="none" d={speedPath} fill="none" stroke="#ffd60a" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />}
        {/* steer lanes: left above, right below */}
        <text x={4} y={16} fontSize={9} fill="#fff" opacity={0.35}>
          IZQ
        </text>
        <text x={4} y={30} fontSize={9} fill="#fff" opacity={0.35}>
          DER
        </text>
        {steerNodes.map((n) => {
          if (n.action.type !== "steer") return null;
          const lay = steerLayout.get(n.id) ?? { row: 0, rows: 1 };
          const h = 12 / lay.rows;
          const y = (n.action.side === "left" ? 6 : 21) + lay.row * h;
          const x0 = x(n.t);
          const w = Math.max(4, x(n.t + n.action.duration) - x0);
          return (
            <g key={n.id}>
              <rect
                x={x0}
                y={y}
                width={w}
                height={h}
                rx={2}
                fill={ACTION_META.steer.color}
                opacity={n.id === selectedId ? 1 : 0.65}
                stroke={n.id === selectedId ? "#fbbf24" : "none"}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                className={disabled ? "cursor-pointer" : "cursor-grab"}
                onPointerDown={(e) => startDrag(e, n, "move")}
              />
              {/* right edge: stretch the duration */}
              <rect
                x={x0 + w - 3}
                y={y}
                width={6}
                height={h}
                fill="#ffffff"
                opacity={n.id === selectedId ? 0.7 : 0.25}
                className={disabled ? "" : "cursor-ew-resize"}
                onPointerDown={(e) => startDrag(e, n, "resize")}
              />
            </g>
          );
        })}
        {otherNodes.map((n) => {
          const meta = ACTION_META[n.action.type];
          const kmh = "targetKmh" in n.action ? n.action.targetKmh : null;
          const cx = x(n.t);
          const cy = kmh !== null ? ySpeed(kmh) : SPEED_BOTTOM - 4;
          return (
            <g key={n.id} className={disabled ? "cursor-pointer" : "cursor-grab"} onPointerDown={(e) => startDrag(e, n, "move")}>
              <line x1={cx} x2={cx} y1={36} y2={SPEED_BOTTOM} stroke={meta.color} opacity={0.35} strokeDasharray="3 3" />
              {/* wider invisible hit area */}
              <rect x={cx - 8} y={36} width={16} height={SPEED_BOTTOM - 36} fill="transparent" />
              <rect x={cx - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${cx} ${cy})`} fill={meta.color} stroke={n.id === selectedId ? "#fbbf24" : "#0b0f14"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {/* the cursor line sits right under the pointer: it must never intercept clicks */}
        {hoverT !== null && <line x1={x(hoverT)} x2={x(hoverT)} y1={4} y2={SPEED_BOTTOM} stroke="#fff" opacity={0.5} pointerEvents="none" />}
      </svg>
      {hoverT !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded bg-black/80 px-2 py-1 font-mono text-[11px] text-white shadow"
          style={{ left: `calc(${(x(hoverT) / W) * 100}% + 8px)`, transform: x(hoverT) > W * 0.75 ? "translateX(calc(-100% - 16px))" : undefined }}
        >
          {drag && dragged ? (
            drag.mode === "resize" && dragged.action.type === "steer" ? (
              <>duración {dragged.action.duration.toFixed(2)} s</>
            ) : (
              <>t {dragged.t.toFixed(2)} s</>
            )
          ) : (
            <>t {hoverT.toFixed(2)} s</>
          )}
          {!drag && hoverFrame && (
            <>
              {" · "}
              {Math.round(hoverFrame.speed * 3.6)} km/h · {Math.round(hoverFrame.progress)} m
            </>
          )}
        </div>
      )}
      {result && compare && compare !== result && (
        <div className="pointer-events-none absolute right-2 top-0 flex gap-3 text-[10px] text-white/60">
          <span>
            <span className="mr-1 inline-block h-0.5 w-4 bg-[#ffd60a] align-middle" />
            Este intento
          </span>
          <span>
            <span className="mr-1 inline-block w-4 border-t border-dashed border-sky-300 align-middle" />
            {compareLabel ?? "Fantasma"}
          </span>
        </div>
      )}
      <p className="mt-1 text-[11px] text-white/40">
        {!result && "Después del primer intento vas a ver acá la curva de velocidad y en qué momento pasaste por cada curva. "}
        {onChange && !disabled && "Arrastrá los nodos para moverlos en el tiempo (Alt/Shift = ajuste fino), estirá el borde de un giro para cambiar su duración y hacé doble clic para agregar uno."}
      </p>
    </div>
  );
}
