import { describe, expect, it } from "vitest";
import { buildGridTemplateColumns, COLUMN_SIZE_MODE } from "./gridTemplateColumns.js";

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

  it("fitDataStretchLast uses minmax on the last data column only (center pane)", () => {
    const t = buildGridTemplateColumns(cols, { columnSizeMode: COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST, section: "center" });
    expect(t).toBe("100px minmax(80px, 1fr)");
  });

  it("fitDataStretchLast on pinned pane uses px only", () => {
    const t = buildGridTemplateColumns(cols, { columnSizeMode: COLUMN_SIZE_MODE.FIT_DATA_STRETCH_LAST, section: "left" });
    expect(t).toBe("100px 80px");
  });

  it("fitWidth uses minmax for every data column in center pane", () => {
    const t = buildGridTemplateColumns(cols, { columnSizeMode: COLUMN_SIZE_MODE.FIT_WIDTH, section: "center" });
    expect(t).toBe("minmax(100px, 1fr) minmax(80px, 1fr)");
  });

  it("fitWidth on pinned pane uses px only", () => {
    const t = buildGridTemplateColumns(cols, { columnSizeMode: COLUMN_SIZE_MODE.FIT_WIDTH, section: "left" });
    expect(t).toBe("100px 80px");
  });
});
