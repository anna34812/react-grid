import { describe, expect, it } from "vitest";
import { fitSetFilterDisplayText } from "./setFilterDisplayText.js";

/** Monospace-style mock: width ≈ char length × factor */
const makeMeasure = (factor = 8) => (text) => text.length * factor;

describe("fitSetFilterDisplayText", () => {
  it("returns full list when it fits", () => {
    const m = makeMeasure(1);
    const wide = 10_000;
    expect(fitSetFilterDisplayText(3, ["a", "b", "c"], wide, m)).toBe("(3) a, b, c");
  });

  it("shows several values then comma ellipsis when truncated", () => {
    const m = makeMeasure(1);
    const text = fitSetFilterDisplayText(1195, ["User6", "User7", "User8", "User9"], 30, m);
    expect(text).toMatch(/^\(1195\)/);
    expect(text).toContain("User6");
    expect(text).toContain("User7");
    expect(text.endsWith("...")).toBe(true);
    expect(m(text)).toBeLessThanOrEqual(40);
  });

  it("fits within max width", () => {
    const m = makeMeasure(1);
    for (const w of [20, 35, 80, 200]) {
      const out = fitSetFilterDisplayText(100, ["Alpha", "Beta", "Gamma", "Delta"], w, m);
      expect(m(out)).toBeLessThanOrEqual(w);
    }
  });
});
