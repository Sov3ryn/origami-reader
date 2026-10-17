import { describe, expect, it } from "vitest";
import { angleBetween, angleOf, arcPath, arcSpan, bounds, constrain, distanceTo, formatLength, newPlan, parseLength, planToDxf, planToSvg, polar, snapGrid, type PlanDoc } from "../src/work/plans/model";

describe("plan lengths", () => {
  it("read what people type, in metric and imperial", () => {
    expect(parseLength("120", "mm")).toBe(120);
    expect(parseLength("12.5 cm", "mm")).toBe(125);
    expect(parseLength("1,2m", "mm")).toBe(1200);
    expect(parseLength('3/4"', "mm")).toBeCloseTo(19.05);
    expect(parseLength("2 1/2", "in")).toBeCloseTo(63.5);
    expect(parseLength("5' 6 1/2\"", "mm")).toBeCloseTo(5 * 304.8 + 6.5 * 25.4);
    expect(parseLength("2ft", "mm")).toBeCloseTo(609.6);
    expect(parseLength("12", "ft")).toBeCloseTo(3657.6);
    expect(parseLength("abc", "mm")).toBeNull();
  });
  it("show lengths in each unit", () => {
    expect(formatLength(1234.5, "mm")).toBe("1234.5 mm");
    expect(formatLength(1234.5, "cm")).toBe("123.45 cm");
    expect(formatLength(1234.5, "m")).toBe("1.235 m");
    expect(formatLength(19.05, "in")).toBe('3/4"');
    expect(formatLength(63.5, "in")).toBe('2 1/2"');
    expect(formatLength(5 * 304.8 + 6.5 * 25.4, "ft")).toBe("5' 6 1/2\"");
  });
});

describe("plan geometry and files", () => {
  it("measures angles like on paper and snaps", () => {
    expect(angleOf([0, 0], [10, 0])).toBe(0);
    expect(angleOf([0, 0], [0, -10])).toBe(90);
    const p = polar([0, 0], 10, 90);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(-10);
    expect(snapGrid([12, 26], 10)).toEqual([10, 30]);
    const c = constrain([0, 0], [10, 1]);
    expect(c[1]).toBeCloseTo(0);
  });
  it("exports SVG in real size and DXF for CAD programs", () => {
    const plan: PlanDoc = {
      ...newPlan("Shelf"),
      id: "p",
      created: 0,
      updated: 0,
      shapes: [
        { id: "1", type: "rect", x: 0, y: 0, w: 800, h: 300 },
        { id: "2", type: "circle", c: [100, 100], r: 20 },
        { id: "3", type: "dim", a: [0, 300], b: [800, 300], offset: 40 },
        { id: "4", type: "text", p: [10, 20], text: "Oak <top>", size: 12 },
      ],
    };
    const svg = planToSvg(plan);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toContain("800 mm");
    expect(svg).toContain("Oak &lt;top&gt;");
    const dxf = planToDxf(plan);
    expect(dxf.match(/^LINE$/gm)?.length).toBe(4 + 3);
    expect(dxf).toContain("CIRCLE");
    expect(dxf).toContain("$INSUNITS");
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });
});

describe("arcs and angles", () => {
  it("measure turns and angles like on paper", () => {
    expect(arcSpan({ start: 350, end: 10 })).toBe(20);
    expect(arcSpan({ start: 0, end: 0 })).toBe(360);
    expect(angleBetween([0, 0], [10, 0], [0, -10])).toBeCloseTo(90);
    expect(angleBetween([0, 0], [10, 0], [-10, -0.0001])).toBeCloseTo(180, 2);
    expect(angleBetween([0, 0], [10, 0], [10, 10])).toBeCloseTo(45);
  });
  it("draw, pick, bound and export arcs", () => {
    const arc = { id: "a", type: "arc" as const, c: [0, 0] as [number, number], r: 10, start: 0, end: 90 };
    expect(arcPath(arc)).toMatch(/^M 10 0 A 10 10 0 0 0 /);
    expect(distanceTo(arc, [0, -10])).toBeCloseTo(0);
    expect(distanceTo(arc, [0, 10])).toBeGreaterThan(5);
    const b = bounds([arc])!;
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(-10);
    const plan = { ...newPlan("Arc"), id: "p", created: 0, updated: 0, shapes: [arc, { id: "g", type: "angle" as const, c: [0, 0] as [number, number], a: [10, 0] as [number, number], b: [0, -10] as [number, number], r: 5 }] };
    const dxf = planToDxf(plan);
    expect(dxf.match(/^ARC$/gm)?.length).toBe(2);
    expect(dxf).toContain("90%%d");
    expect(dxf).not.toContain("°");
    expect(planToSvg(plan)).toContain("90°");
  });
});
