import { describe, expect, it } from "vitest";
import { mergeColumnOrder, reorderFields } from "./columnOrder";

describe("mergeColumnOrder", () => {
  it("uses column definition order when no previous order", () => {
    const cols = [{ field: "a" }, { field: "b" }];
    expect(mergeColumnOrder(undefined, cols)).toEqual(["a", "b"]);
  });

  it("preserves previous order for existing fields", () => {
    const cols = [{ field: "a" }, { field: "b" }, { field: "c" }];
    expect(mergeColumnOrder(["c", "a"], cols)).toEqual(["c", "a", "b"]);
  });

  it("drops fields removed from columns", () => {
    const cols = [{ field: "a" }];
    expect(mergeColumnOrder(["a", "gone"], cols)).toEqual(["a"]);
  });
});

describe("reorderFields", () => {
  it("moves a field to another index", () => {
    expect(reorderFields(["a", "b", "c", "d"], "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("returns same reference when from equals to", () => {
    const order = ["a", "b"];
    expect(reorderFields(order, "a", "a")).toBe(order);
  });
});
