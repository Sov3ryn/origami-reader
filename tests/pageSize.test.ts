import { describe, expect, it } from "vitest";
import { pageSizeOf, pageWidths } from "../src/work/papers";

describe("note page size", () => {
  it("uses the note's own size first, then its subject's, then standard", () => {
    expect(pageSizeOf({ pageSize: "wide" }, { pageSize: "narrow" })).toBe("wide");
    expect(pageSizeOf({}, { pageSize: "narrow" })).toBe("narrow");
    expect(pageSizeOf({})).toBe("standard");
  });
  it("ignores unknown sizes", () => {
    expect(pageSizeOf({ pageSize: "huge" }, { pageSize: "toString" })).toBe("standard");
  });
  it("gives full width no column limit", () => {
    expect(pageWidths.full).toBeNull();
    expect(pageWidths.narrow! < pageWidths.standard! && pageWidths.standard! < pageWidths.wide!).toBe(true);
  });
});
