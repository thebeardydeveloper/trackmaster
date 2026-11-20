/** Rating of 0–3 stars (training levels). Filled stars are amber, the rest faint white. */
export function Stars({ n, size = "text-lg" }: { /** Stars earned, 0–3. */ n: number; /** Tailwind text-size class, e.g. `text-base`, `text-3xl`. */ size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${n} estrellas`}>
      {[1, 2, 3].map((k) => (
        <span key={k} className={k <= n ? "text-amber-300" : "text-white/15"}>
          ★
        </span>
      ))}
    </span>
  );
}
