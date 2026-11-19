"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CAR } from "../sim/constants";
import type { Action, ActionType, Instruction } from "../sim/types";
import { newId } from "../game/format";

export const ACTION_META: Record<
  ActionType,
  { label: string; color: string; short: string }
> = {
  accelerate: { label: "Acelerar", color: "#34c759", short: "ACE" },
  brake: { label: "Frenar", color: "#ff453a", short: "FRE" },
  steer: { label: "Girar", color: "#0a84ff", short: "GIR" },
  coast: { label: "Soltar", color: "#8e8e93", short: "SOL" },
};

export function defaultAction(type: ActionType, prev?: Action): Action {
  switch (type) {
    case "accelerate":
      return {
        type,
        targetKmh: prev && "targetKmh" in prev ? prev.targetKmh : 200,
      };
    case "brake":
      return {
        type,
        targetKmh: prev && "targetKmh" in prev ? prev.targetKmh : 100,
      };
    case "steer":
      return { type, side: "right", degrees: 5, duration: 1.5 };
    case "coast":
      return { type };
  }
}

export function describe(a: Action): string {
  switch (a.type) {
    case "accelerate":
      return `acelerar a ${a.targetKmh} km/h`;
    case "brake":
      return `frenar a ${a.targetKmh} km/h`;
    case "steer":
      return `girar ${a.degrees}° a la ${a.side === "left" ? "izquierda" : "derecha"} durante ${a.duration} s`;
    case "coast":
      return "soltar acelerador y freno";
  }
}

/** Numeric input that lets you type freely and commits valid values. */
function NumField({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  disabled,
  width = "w-20",
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  width?: string;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (raw.trim() !== "" && Number.isFinite(v))
      onChange(Math.max(min, Math.min(max, v)));
  };
  return (
    <label className="flex items-center gap-1 rounded-md bg-black/30 px-2 py-1 ring-1 ring-white/10 focus-within:ring-amber-400/70">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        className={`${width} bg-transparent font-mono text-sm tabular-nums text-white outline-none [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none`}
        value={shown}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => {
          setText(String(value));
          setFocused(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="text-xs text-white/50">{suffix}</span>
    </label>
  );
}

/**
 * A "nice" time strictly between two others (prefers 0.1, then 0.05, then 0.01 steps).
 * Used when a node is inserted or dropped between two existing ones.
 */
export function timeBetween(
  a: number | undefined,
  b: number | undefined,
): number {
  if (a === undefined && b === undefined) return 0;
  if (b === undefined) return Math.round(((a as number) + 1) * 10) / 10;
  const lo = a ?? Math.max(0, b - 2);
  if (lo >= b) return b;
  const mid = (lo + b) / 2;
  for (const q of [0.1, 0.05, 0.01]) {
    const r = Number((Math.round(mid / q) * q).toFixed(2));
    if (r > lo && r < b) return r;
  }
  return Number(mid.toFixed(3));
}

function NodeRow({
  node,
  index,
  selected,
  disabled,
  dragging,
  onChange,
  onDelete,
  onDuplicate,
  onSelect,
  onHandleDown,
}: {
  node: Instruction;
  index: number;
  selected: boolean;
  disabled: boolean;
  dragging: boolean;
  onChange: (n: Instruction) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelect: () => void;
  onHandleDown: (e: React.PointerEvent) => void;
}) {
  const a = node.action;
  const meta = ACTION_META[a.type];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected)
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const setAction = (action: Action) => onChange({ ...node, action });

  return (
    <div
      ref={ref}
      data-node-id={node.id}
      onClick={onSelect}
      className={`group relative flex flex-col gap-2 rounded-lg border bg-white/[0.04] p-2.5 pl-4 transition ${
        selected
          ? "border-amber-400/80 bg-white/[0.08]"
          : "border-white/10 hover:border-white/25"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <span
        className="absolute inset-y-2 left-1.5 w-1 rounded-full"
        style={{ background: meta.color }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="button"
          tabIndex={-1}
          aria-label="Arrastrar para cambiar el orden"
          title="Arrastrá para ubicarlo entre otros nodos"
          onPointerDown={onHandleDown}
          className={`flex w-8 select-none items-center gap-1 font-mono text-xs text-white/40 touch-none ${disabled ? "" : "cursor-grab hover:text-white"}`}
        >
          <span aria-hidden className="tracking-[-0.2em]">
            ⋮⋮
          </span>
          {index + 1}
        </span>
        <NumField
          label="Tiempo"
          value={node.t}
          min={0}
          max={600}
          step={0.1}
          suffix="s"
          disabled={disabled}
          onChange={(t) => onChange({ ...node, t })}
        />
        <select
          aria-label="Acción"
          className="rounded-md bg-black/30 px-2 py-1 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-amber-400/70 disabled:opacity-50"
          value={a.type}
          disabled={disabled}
          onChange={(e) =>
            setAction(defaultAction(e.target.value as ActionType, a))
          }
        >
          {(Object.keys(ACTION_META) as ActionType[]).map((t) => (
            <option key={t} value={t} className="bg-zinc-900">
              {ACTION_META[t].label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1 opacity-60 transition group-hover:opacity-100">
          <button
            type="button"
            title="Duplicar"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="rounded px-1.5 py-0.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30"
          >
            ⧉
          </button>
          <button
            type="button"
            title="Borrar"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded px-1.5 py-0.5 text-xs text-white/70 hover:bg-red-500/30 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      </div>
      {a.type !== "coast" && (
        <div className="flex flex-wrap items-center gap-2 pl-7">
          {(a.type === "accelerate" || a.type === "brake") && (
            <>
              <span className="text-xs text-white/50">hasta</span>
              <NumField
                label="Velocidad"
                value={a.targetKmh}
                min={0}
                max={CAR.maxKmh}
                step={5}
                suffix="km/h"
                disabled={disabled}
                onChange={(v) => setAction({ ...a, targetKmh: v })}
              />
            </>
          )}
          {a.type === "steer" && (
            <>
              <div className="flex overflow-hidden rounded-md ring-1 ring-white/10">
                {(["left", "right"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAction({ ...a, side });
                    }}
                    className={`px-2 py-1 text-xs ${a.side === side ? "bg-sky-500/80 text-white" : "bg-black/30 text-white/60 hover:text-white"}`}
                  >
                    {side === "left" ? "◀ Izq" : "Der ▶"}
                  </button>
                ))}
              </div>
              <NumField
                label="Grados"
                value={a.degrees}
                min={0}
                max={CAR.maxSteerDeg}
                step={0.1}
                suffix="°"
                width="w-14"
                disabled={disabled}
                onChange={(v) => setAction({ ...a, degrees: v })}
              />
              <span className="text-xs text-white/50">durante</span>
              <NumField
                label="Duración"
                value={a.duration}
                min={0}
                max={60}
                step={0.05}
                suffix="s"
                width="w-14"
                disabled={disabled}
                onChange={(v) => setAction({ ...a, duration: v })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function NodeEditor({
  nodes,
  onChange,
  disabled,
  selectedId,
  onSelect,
}: {
  nodes: Instruction[];
  onChange: (nodes: Instruction[]) => void;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const sorted = [...nodes].sort((a, b) => a.t - b.t);
  /** New nodes go right after the selected one (halfway to the next), or at the end. */
  const add = (type: ActionType) => {
    const sel =
      nodes.find((n) => n.id === selectedId) ?? sorted[sorted.length - 1];
    const k = sel ? sorted.indexOf(sel) : -1;
    const t = sel ? timeBetween(sel.t, sorted[k + 1]?.t) : 0;
    const node: Instruction = { id: newId(), t, action: defaultAction(type) };
    onChange([...sorted.slice(0, k + 1), node, ...sorted.slice(k + 1)]);
    onSelect(node.id);
  };

  // --- drag to reorder (the node gets a time between its new neighbours) ---
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<{ id: string; gap: number } | null>(
    null,
  );
  const dragRef = useRef<{ id: string; gap: number } | null>(null);
  const setDrag = (d: { id: string; gap: number } | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const latest = useRef({ nodes, onChange });
  useEffect(() => {
    latest.current = { nodes, onChange };
  });

  /** Index among the other rows where the dragged one would land. */
  const gapAt = (clientY: number, id: string) => {
    const rows = [
      ...(listRef.current?.querySelectorAll<HTMLElement>("[data-node-id]") ??
        []),
    ].filter((r) => r.dataset.nodeId !== id);
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return k;
    }
    return rows.length;
  };

  const startReorder = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    onSelect(id);
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    setDrag({ id, gap: gapAt(e.clientY, id) });
    const move = (ev: PointerEvent) => {
      const list = listRef.current;
      if (list) {
        // auto-scroll near the edges of the list
        const r = list.getBoundingClientRect();
        if (ev.clientY < r.top + 40) list.scrollTop -= 12;
        else if (ev.clientY > r.bottom - 40) list.scrollTop += 12;
      }
      const gap = gapAt(ev.clientY, id);
      if (dragRef.current && dragRef.current.gap !== gap) setDrag({ id, gap });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const { nodes: cur, onChange: change } = latest.current;
      const ordered = [...cur].sort((a, b) => a.t - b.t);
      const moved = ordered.find((n) => n.id === d.id);
      if (!moved) return;
      const others = ordered.filter((n) => n.id !== d.id);
      if (ordered.indexOf(moved) === d.gap) return; // dropped where it was
      const t = timeBetween(others[d.gap - 1]?.t, others[d.gap]?.t);
      change([
        ...others.slice(0, d.gap),
        { ...moved, t },
        ...others.slice(d.gap),
      ]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const indicator = (
    <div className="h-0.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
  );
  let otherIdx = 0;
  const update = (n: Instruction) =>
    onChange(nodes.map((x) => (x.id === n.id ? n : x)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(ACTION_META) as ActionType[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => add(t)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
          >
            <span className="mr-1" style={{ color: ACTION_META[t].color }}>
              +
            </span>
            {ACTION_META[t].label}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        className="-mr-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2"
      >
        {sorted.length === 0 && (
          <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/50">
            Todavía no hay órdenes. Agregá un nodo: por ejemplo,{" "}
            <b className="text-white/80">Acelerar</b> en t = 0.
          </p>
        )}
        {sorted.map((n, i) => {
          const isDragged = drag?.id === n.id;
          const showIndicator = drag && !isDragged && otherIdx === drag.gap;
          if (!isDragged) otherIdx++;
          return (
            <Fragment key={n.id}>
              {showIndicator && indicator}
              <NodeRow
                node={n}
                index={i}
                selected={n.id === selectedId}
                disabled={disabled}
                dragging={isDragged}
                onHandleDown={(e) => startReorder(e, n.id)}
                onSelect={() => onSelect(n.id)}
                onChange={update}
                onDelete={() => {
                  onChange(nodes.filter((x) => x.id !== n.id));
                  if (selectedId === n.id) onSelect(null);
                }}
                onDuplicate={() => {
                  const copy = {
                    ...n,
                    id: newId(),
                    t: Math.round((n.t + 0.5) * 100) / 100,
                  };
                  onChange([...nodes, copy]);
                  onSelect(copy.id);
                }}
              />
            </Fragment>
          );
        })}
        {drag && drag.gap >= sorted.length - 1 && indicator}
      </div>
    </div>
  );
}
