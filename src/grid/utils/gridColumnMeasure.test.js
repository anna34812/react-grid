import { describe, expect, it } from "vitest";
import { measureColumnContentWidth, measureColumnHeaderContentWidth, measureHeaderTitleRowWidth, measureIntrinsicWidth } from "./gridColumnMeasure.js";

describe("measureIntrinsicWidth", () => {
  it("restores inline styles after measure", () => {
    const el = document.createElement("div");
    el.style.width = "50px";
    measureIntrinsicWidth(el);
    expect(el.style.width).toBe("50px");
  });
});

describe("measureHeaderTitleRowWidth", () => {
  it("releases flex/ellipsis on the button then restores styles", () => {
    const row = document.createElement("div");
    row.className = "header-cell header-cell--title-row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-button";
    btn.textContent = "x";
    btn.style.flex = "1";
    btn.style.overflow = "hidden";
    row.appendChild(btn);
    Object.defineProperty(row, "scrollWidth", { value: 220, configurable: true });
    Object.defineProperty(row, "offsetWidth", { value: 220, configurable: true });
    row.getBoundingClientRect = () => ({ width: 220 });

    const w = measureHeaderTitleRowWidth(row);
    expect(w).toBe(220);
    expect(btn.style.flex).toMatch(/^1/);
    expect(btn.style.overflow).toBe("hidden");
  });
});

describe("measureColumnHeaderContentWidth", () => {
  it("returns minW when no matching header cells", () => {
    const root = document.createElement("div");
    expect(measureColumnHeaderContentWidth(root, "a", 100)).toBe(100);
  });
});

describe("measureColumnContentWidth", () => {
  it("returns minW when no cells", () => {
    const root = document.createElement("div");
    expect(measureColumnContentWidth(root, "a", 100)).toBe(100);
  });

  it("takes max of baseline scrollWidth and intrinsic measure", () => {
    const root = document.createElement("div");
    const c = document.createElement("div");
    c.setAttribute("data-field", "name");
    Object.defineProperty(c, "scrollWidth", { value: 240, configurable: true });
    c.getBoundingClientRect = () => ({ width: 100 });
    root.appendChild(c);
    expect(measureColumnContentWidth(root, "name", 80)).toBe(240);
  });
});
