import { project, type Track } from "../sim/track";
import type { RaceResult } from "../sim/types";

export type HintTone = "good" | "warn" | "bad" | "info";
export interface Hint {
  tone: HintTone;
  text: string;
}

const cornerName = (i: number | null) => (i === null ? "la recta" : `T${i + 1}`);

/** Turns a race result into short, actionable advice for the player. */
export function hintsFor(
  track: Track,
  r: RaceResult,
  opts: { maxFinishKmh?: number; threeStars?: number; cornerLimit?: (i: number) => number; rain?: boolean } = {},
): Hint[] {
  const hints: Hint[] = [];
  const limit = (i: number) => opts.cornerLimit?.(i) ?? track.corners[i].maxKmh;

  for (const e of r.events.filter((ev) => ev.type === "spin").slice(0, 2)) {
    const c = e.corner !== null ? track.corners[e.corner] : null;
    hints.push({
      tone: "bad",
      text: c
        ? `Trompo en ${cornerName(e.corner)} a ${e.kmh} km/h. ${opts.rain ? "Con la pista mojada esa" : "Esa"} curva se toma a ~${Math.round(limit(c.index))} km/h como máximo: frená antes.`
        : `Trompo a los ${e.t.toFixed(1)} s a ${e.kmh} km/h: giraste demasiado fuerte para esa velocidad.`,
    });
  }

  r.cornerEntryKmh.forEach((kmh, i) => {
    if (kmh !== null && kmh > limit(i) * 1.08 && !r.events.some((e) => e.type === "spin" && e.corner === i)) {
      hints.push({
        tone: "warn",
        text: `Entraste a ${cornerName(i)} a ${kmh} km/h y el límite es ~${Math.round(limit(i))}: el auto se va a abrir.`,
      });
    }
  });

  for (const e of r.events.filter((ev) => ev.type === "offtrack").slice(0, 2)) {
    const p = project(track, e.x, e.y, -1);
    const c = e.corner !== null ? track.corners[e.corner] : null;
    let why: string;
    if (!c) {
      why = "el rumbo quedó torcido después de la curva: ajustá la duración del giro o agregá una corrección chica.";
    } else {
      const outside = (c.dir === "right" && p.lateral > 0) || (c.dir === "left" && p.lateral < 0);
      why = outside
        ? "por afuera: giraste poco, muy tarde, o entraste muy rápido."
        : "por adentro: giraste de más o empezaste a girar muy temprano.";
    }
    hints.push({ tone: "warn", text: `Te saliste a los ${e.t.toFixed(1)} s cerca de ${cornerName(e.corner)}, ${why}` });
  }

  const walls = r.events.filter((e) => e.type === "wall").length;
  if (walls > 0) hints.push({ tone: "bad", text: `Tocaste el muro ${walls} ${walls === 1 ? "vez" : "veces"}: cada golpe te frena mucho.` });

  if (r.dnfReason === "stopped") {
    hints.push({ tone: "bad", text: "El auto se quedó parado y no quedan órdenes: agregá un nodo de acelerar." });
  } else if (r.dnfReason === "timeout") {
    hints.push({
      tone: "bad",
      text: `Se acabó el tiempo: completaste el ${Math.round(r.completion * 100)}% del recorrido.`,
    });
  }

  if (r.finished && opts.maxFinishKmh !== undefined && r.finishKmh !== null && r.finishKmh > opts.maxFinishKmh) {
    hints.push({
      tone: "bad",
      text: `Cruzaste la meta a ${r.finishKmh} km/h; el máximo es ${opts.maxFinishKmh}. Agregá un nodo de frenar antes.`,
    });
  }

  if (r.finished && r.time !== null && opts.threeStars !== undefined && r.time > opts.threeStars && hints.length === 0) {
    hints.push({
      tone: "info",
      text: `Para 3 estrellas necesitás ${opts.threeStars.toFixed(1)} s o menos. Probá acelerar más en las rectas y frenar más tarde.`,
    });
  }

  if (hints.length === 0 && r.finished) hints.push({ tone: "good", text: "¡Vuelta limpia! Sin salidas ni trompos." });
  return hints.slice(0, 5);
}
