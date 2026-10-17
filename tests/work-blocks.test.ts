import { describe, expect, it } from "vitest";
import { cleanHtml, diagramsAsSvg, exportFiles, htmlToMarkdown, inkAsSvg, markdownToHtml, mathAsMathml } from "../src/work/transfer";
import { answerMatch, inkToSvg, linesText, parseInk, serializeInk, strokePath, strokesNear, type InkData } from "../src/work/ink/ink";
import { noteCardLines, noteText } from "../src/work/text";
import { templates } from "../src/work/templates";

describe("formulas", () => {
  const html = cleanHtml(
    '<p>Energy <span data-type="inline-math" data-latex="E = mc^2"></span> here</p><div data-type="block-math" data-latex="\\frac{a}{b}"></div>',
  );
  it("survive saving", () => {
    expect(html).toContain('data-latex="E = mc^2"');
    expect(html).toContain('data-type="block-math"');
  });
  it("round trip through Markdown", () => {
    const md = htmlToMarkdown(html);
    expect(md).toContain("Energy $E = mc^2$ here");
    expect(md).toContain("$$\n\\frac{a}{b}\n$$");
    const back = markdownToHtml(md);
    expect(back).toContain('data-latex="E = mc^2"');
    expect(back).toContain('data-latex="\\frac{a}{b}"');
  });
  it("export as MathML that needs no extra files", () => {
    const out = mathAsMathml(html);
    expect(out).toContain("<math");
    expect(out).toContain('<div class="formula">');
    expect(out).not.toContain("data-latex");
  });
  it("count as text for search and card lines", () => {
    expect(noteText(html)).toContain("$$E = mc^2$$");
    const lines = noteCardLines('<p>Mass-energy :: <span data-type="inline-math" data-latex="E = mc^2"></span></p>');
    expect(lines).toEqual([{ front: "Mass-energy", back: "$$E = mc^2$$" }]);
  });
});

describe("handwriting", () => {
  const ink: InkData = {
    h: 300,
    strokes: [
      { tool: "pen", c: "blue", s: 3.6, p: [[10, 10, 0.5], [60, 40, 0.7], [120, 80, 0.4]] },
      { tool: "highlighter", c: "yellow", s: 3.6, p: [[200, 200, 0.5], [400, 200, 0.5]] },
    ],
  };
  it("stores strokes compactly and rejects junk", () => {
    const back = parseInk(serializeInk(ink));
    expect(back.strokes).toHaveLength(2);
    expect(back.h).toBe(300);
    expect(parseInk('{"h":20,"strokes":[{"tool":"spray","p":[]},null]}')).toEqual({ h: 80, strokes: [] });
    expect(parseInk("not json").strokes).toEqual([]);
  });
  it("draws strokes as paths and exports SVG with highlighter underneath", () => {
    expect(strokePath(ink.strokes[0])).toMatch(/^M [\d.]+ [\d.]+ Q/);
    const svg = inkToSvg(ink, "My <notes>");
    expect(svg.indexOf("#ffe14d")).toBeLessThan(svg.indexOf("#2554c7"));
    expect(svg).toContain("<title>My notes</title>");
  });
  it("finds strokes under the eraser, even between points", () => {
    expect([...strokesNear(ink, 90, 60, 5)]).toEqual([0]);
    expect([...strokesNear(ink, 300, 202, 5)]).toEqual([1]);
    expect(strokesNear(ink, 800, 20, 5).size).toBe(0);
  });
  it("keeps notes with ink through saving, search and export", () => {
    const html = cleanHtml(`<div data-ink='${serializeInk(ink)}' data-ink-id="ab12" data-ink-text="photosynthesis needs light"></div>`);
    expect(html).toContain('data-ink-id="ab12"');
    expect(noteText(html)).toContain("photosynthesis needs light");
    const out = inkAsSvg(html);
    expect(out).toContain('<figure class="ink"><svg');
    expect(htmlToMarkdown(html)).toContain("![photosynthesis needs light](ink:ab12)");
  });
  it("reads lines in order and compares written answers", () => {
    const lines = [
      { candidates: ["world"], top: 10, left: 200 },
      { candidates: ["hello", "hullo"], top: 12, left: 20 },
      { candidates: ["again"], top: 90, left: 20 },
    ].sort((a, b) => (Math.abs(a.top - b.top) < 24 ? a.left - b.left : a.top - b.top));
    expect(linesText(lines)).toBe("hello world\nagain");
    expect(linesText(lines, { 0: 1 })).toBe("hullo world\nagain");
    expect(answerMatch("Mitochondrie", "mitochondrie")).toBe(1);
    expect(answerMatch("Ecole", "École.")).toBe(1);
    expect(answerMatch("photosynthesis", "photosynthese")).toBeGreaterThan(0.8);
    expect(answerMatch("cat", "mitochondria")).toBeLessThan(0.3);
  });
});

describe("diagrams", () => {
  it("keep their text and become ```mermaid in Markdown, and back", () => {
    const html = cleanHtml('<div data-diagram="flowchart LR&#10;  A --&gt; B"></div>');
    expect(html).toContain("data-diagram=");
    const md = htmlToMarkdown(html);
    expect(md).toContain("```mermaid\nflowchart LR\n  A --> B\n```");
    const back = markdownToHtml("Intro\n\n```mermaid\nflowchart TD\n  X --> Y\n```\n\n```js\nlet a = 1\n```");
    expect(back).toContain('data-diagram="flowchart TD');
    expect(back).toContain("<pre><code");
  });
  it("export as text when no drawing is available", () => {
    expect(diagramsAsSvg('<div data-diagram="pie title A" class="diagram-block"></div>')).toBe('<pre class="diagram"><code>pie title A</code></pre>');
    expect(diagramsAsSvg('<div data-diagram="pie" class="diagram-block"></div>', new Map([["pie", "<svg/>"]]))).toBe('<figure class="diagram"><svg/></figure>');
  });
});

describe("templates", () => {
  it("make no study cards until filled in, and survive the note schema", () => {
    for (const tpl of templates()) {
      expect(noteCardLines(tpl.html)).toEqual([]);
      const clean = cleanHtml(tpl.html);
      expect(clean.length).toBeGreaterThan(tpl.html.length * 0.6);
    }
    expect(noteCardLines("<p>Mitochondria :: the cell's power plant</p>")).toHaveLength(1);
  });
});

describe("plans in notes", () => {
  it("survive saving and export as the drawing, with Markdown pointing at it", () => {
    const html = cleanHtml('<p>Shelf</p><div data-plan="plan-1"></div>');
    expect(html).toContain('data-plan="plan-1"');
    const plan = { id: "plan-1", kind: "plan", title: "Shelf", units: "mm", grid: 10, snap: true, paper: "white", created: 0, updated: 0, shapes: [{ id: "r", type: "rect", x: 0, y: 0, w: 800, h: 300 }] };
    const files = exportFiles({ subjects: [], notes: [{ id: "n", kind: "note", title: "Furniture", html, created: 0, updated: 0 }], cards: [], batches: [], hidden: [], vectors: [], logs: [], meta: [], sheets: [], charts: [], boards: [], stickies: [], workspaces: [], plans: [plan] } as never);
    const page = files.find(([p]) => p === "Furniture.html")![1];
    expect(page).toContain('<figure class="plan"><svg');
    const md = files.find(([p]) => p === "Furniture.md")![1];
    expect(md).toContain("![Shelf](Shelf.svg)");
    expect(files.some(([p]) => p === "Shelf.dxf")).toBe(true);
  });
});
