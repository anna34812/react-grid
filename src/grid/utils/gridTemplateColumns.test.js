import { describe, expect, it } from "vitest";
import { buildGridTemplateColumns } from "./gridTemplateColumns.js";

describe("buildGridTemplateColumns", () => {
  const cols = [
    { field: "a", minWidth: 100 },
    { field: "b", minWidth: 80 },
  ];

  it("uses fixed px from column minWidth", () => {
    const t = buildGridTemplateColumns(cols, {});
    expect(t).toBe("100px 80px");
  });

  it("applies columnWidths overrides", () => {
    const t = buildGridTemplateColumns(cols, { columnWidths: { a: 220, b: 90 } });
    expect(t).toBe("220px 90px");
  });

  it("clamps width to minWidth", () => {
    const t = buildGridTemplateColumns(cols, { columnWidths: { a: 50 } });
    expect(t).toBe("100px 80px");
  });

  it("includes row drag and select tracks", () => {
    const t = buildGridTemplateColumns(cols, { showRowDrag: true, showSelect: true, columnWidths: {} });
    expect(t).toBe("36px 44px 100px 80px");
  });
});
