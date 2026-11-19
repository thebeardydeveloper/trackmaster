/** 51.683 → "51.683" · 83.2 → "1:23.200" */
export function formatTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(3).padStart(m > 0 ? 6 : 1, "0");
  return m > 0 ? `${m}:${ss}` : ss;
}

export function formatDelta(d: number): string {
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
