import { describe, expect, it } from "vitest";
import { timeBetween } from "./NodeEditor";

describe("timeBetween", () => {
  it("picks a round time strictly between two nodes", () => {
    expect(timeBetween(10, 12)).toBe(11);
    expect(timeBetween(10, 10.3)).toBe(10.2);
    expect(timeBetween(10, 10.1)).toBe(10.05);
    expect(timeBetween(10, 10.02)).toBe(10.01);
  });
  it("handles the ends of the list", () => {
    expect(timeBetween(undefined, 5)).toBe(4);
    const t = timeBetween(undefined, 0.5);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.5);
    expect(timeBetween(7.3, undefined)).toBe(8.3);
    expect(timeBetween(undefined, undefined)).toBe(0);
    expect(timeBetween(4, 4)).toBe(4);
  });
});
