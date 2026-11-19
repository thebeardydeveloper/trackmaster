"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** True only on the client after hydration (localStorage-backed state is safe to read). */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
