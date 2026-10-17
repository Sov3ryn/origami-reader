import { describe, expect, it } from "vitest";
import { exportWorkspace, importWorkspace, inWorkspace, MAIN, stamp, type WorkspaceDoc } from "../src/work/workspaces";
import type { WorkData, WorkItem } from "../src/work/types";

const noteId = "11111111-2222-4333-8444-555555555555";
const sheetId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const chartId = "99999999-8888-4777-8666-555555555555";
const ws: WorkspaceDoc = { id: "ws-physics-0001", kind: "workspace", name: "Physics", color: "#4f8fd6", created: 1 };

function data(items: WorkItem[]): WorkData {
  const d: WorkData = { subjects: [], notes: [], cards: [], batches: [], hidden: [], vectors: [], logs: [], meta: [], sheets: [], charts: [], boards: [], stickies: [], workspaces: [] };
  const lists: Record<string, keyof WorkData> = { note: "notes", card: "cards", sheet: "sheets", chart: "charts", sticky: "stickies", workspace: "workspaces", log: "logs" };
  for (const i of items) (d[lists[i.kind]] as WorkItem[]).push(i);
  return d;
}
const note = (id: string, workspace?: string) =>
  ({ id, kind: "note", title: "Forces", html: `<p>Push :: pull</p><div data-chart="${chartId}"></div>`, created: 1, updated: 1, ...(workspace ? { workspace } : {}) }) as unknown as WorkItem;

describe("workspaces", () => {
  it("show only their own items, and share study logs", () => {
    const d = data([note("n-main-0001"), note(noteId, ws.id), { id: "log1", kind: "log", date: "2026-10-17", reviews: 1, remembered: 1 } as WorkItem]);
    expect(inWorkspace(d, MAIN).notes.map((n) => n.id)).toEqual(["n-main-0001"]);
    expect(inWorkspace(d, ws.id).notes.map((n) => n.id)).toEqual([noteId]);
    expect(inWorkspace(d, ws.id).logs).toHaveLength(1);
  });
  it("put new items in the open workspace and its vault", () => {
    const sealed = { ...ws, vault: "v1" };
    const [n, log] = stamp([note("x-note-0001"), { id: "l", kind: "log" } as WorkItem], sealed, ws.id) as (WorkItem & { workspace?: string; vault?: string })[];
    expect(n.workspace).toBe(ws.id);
    expect(n.vault).toBe("v1");
    expect((log as { workspace?: string }).workspace).toBeUndefined();
    expect((stamp([note("y-note-0001")], undefined, MAIN)[0] as { workspace?: string }).workspace).toBeUndefined();
  });
  it("export and import as a copy whose references follow", () => {
    const card = { id: `${noteId}:abc123`, kind: "card", noteId, front: "Push", back: "pull", origin: "note", vault: "v1", workspace: ws.id } as unknown as WorkItem;
    const chart = { id: chartId, kind: "chart", source: { kind: "sheet", sheetId }, workspace: ws.id } as unknown as WorkItem;
    const sheet = { id: sheetId, kind: "sheet", title: "Data", workspace: ws.id } as unknown as WorkItem;
    const sticky = { id: "22222222-3333-4444-8555-666666666666", kind: "sticky", doc: noteId, text: "Ask", workspace: ws.id } as unknown as WorkItem;
    const file = exportWorkspace(data([note(noteId, ws.id), card, chart, sheet, sticky, note("other-note-01")]), ws);
    expect(file).not.toContain('"vault"');
    expect(file).not.toContain("other-note-01");
    const { workspace, items } = importWorkspace(file, ["Physics"]);
    expect(workspace.name).toBe("Physics (imported)");
    const n = items.find((i) => i.kind === "note") as unknown as { id: string; html: string; workspace: string };
    const c = items.find((i) => i.kind === "card") as unknown as { id: string; noteId: string };
    const ch = items.find((i) => i.kind === "chart") as unknown as { id: string; source: { sheetId: string } };
    const sh = items.find((i) => i.kind === "sheet") as unknown as { id: string };
    const st = items.find((i) => i.kind === "sticky") as unknown as { doc: string };
    expect(n.id).not.toBe(noteId);
    expect(n.workspace).toBe(workspace.id);
    expect(c.noteId).toBe(n.id);
    expect(c.id).toBe(`${n.id}:abc123`);
    expect(ch.source.sheetId).toBe(sh.id);
    expect(n.html).toContain(`data-chart="${ch.id}"`);
    expect(st.doc).toBe(n.id);
    expect(() => importWorkspace("{}", [])).toThrow();
  });
});
