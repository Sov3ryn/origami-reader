import { describe, expect, it } from "vitest";
import { makeCard } from "../src/work/cards";
import { buildTest, exportCardSet, importCardSet } from "../src/work/practice";
import { fitMask, maskFrom, maskOrder, newPictureSet, safeImage, syncPictureCards, type PictureSet } from "../src/work/pictures";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
const heart = (): PictureSet => ({
  ...newPictureSet("s", 0),
  title: "Parts of the heart",
  image: IMAGE,
  width: 800,
  height: 600,
  masks: [
    { id: "b", x: 0.6, y: 0.1, w: 0.1, h: 0.1, label: "Aorta" },
    { id: "a", x: 0.1, y: 0.1, w: 0.1, h: 0.1, label: "Vena cava" },
    { id: "c", x: 0.3, y: 0.7, w: 0.1, h: 0.1, label: "Left ventricle" },
    { id: "d", x: 0.5, y: 0.5, w: 0.1, h: 0.1, label: "" },
  ],
});

describe("boxes", () => {
  it("are made from two corners in any order and kept inside the picture", () => {
    expect(maskFrom({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 }, "m")).toEqual({ id: "m", x: 0.2, y: 0.1, w: 0.3, h: 0.5, label: "" });
    const m = fitMask({ id: "m", x: 0.95, y: -0.2, w: 0.2, h: 0.001, label: "x".repeat(300) });
    expect(m.x + m.w).toBeCloseTo(1);
    expect(m.y).toBe(0);
    expect(m.h).toBe(0.01);
    expect(m.label).toHaveLength(200);
  });
  it("are numbered top to bottom, then left to right", () => {
    expect(maskOrder(heart().masks).map((m) => m.id)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("picture cards", () => {
  it("follow the boxes and keep their review history", () => {
    const set = heart();
    const first = syncPictureCards(set, [], 1);
    expect(first.save).toHaveLength(4);
    expect(first.save.every((c) => c.type === "picture" && c.front === "Parts of the heart" && c.subjectId === "s")).toBe(true);
    expect(first.save.find((c) => c.picture?.mask === "b")?.back).toBe("Aorta");

    // Reviewed once; then a label changes and a box goes.
    const cards = first.save.map((c) => ({ ...c, schedule: { ...c.schedule, reps: 3 } }));
    const changed = { ...set, masks: set.masks.filter((m) => m.id !== "c").map((m) => (m.id === "b" ? { ...m, label: "Aortic arch" } : m)) };
    const next = syncPictureCards(changed, cards, 2);
    expect(next.save).toHaveLength(1);
    expect(next.save[0].back).toBe("Aortic arch");
    expect(next.save[0].schedule.reps).toBe(3);
    expect(next.remove).toEqual([cards.find((c) => c.picture?.mask === "c")!.id]);
    // Nothing to do when nothing changed; no cards without a picture.
    expect(syncPictureCards(changed, [...cards.filter((c) => c.picture?.mask !== "c"), ...next.save], 3).save).toHaveLength(0);
    expect(syncPictureCards({ ...set, image: "" }, [], 4).save).toHaveLength(0);
  });

  it("are asked in practice tests with the other labels as choices", () => {
    const set = heart();
    const cards = syncPictureCards(set, [], 1).save;
    const extra = makeCard({ type: "qa", front: "Pump?", back: "Heart" }, 1);
    const test = buildTest([...cards, extra], 10, "choice", () => 0.3);
    // The unlabelled box has no answer to check, so it is left out.
    expect(test).toHaveLength(4);
    const q = test.find((x) => x.card.picture?.mask === "b")!;
    expect(q.answer).toBe("Aorta");
    expect(q.choices).toContain("Vena cava");
  });

  it("travel in card set files with their picture, under new ids", () => {
    const set = heart();
    const cards = [...syncPictureCards(set, [], 1).save, makeCard({ type: "qa", front: "Pump?", back: "Heart" }, 1)];
    const file = exportCardSet("Cardio", cards, [set, { ...newPictureSet(), id: "other", image: IMAGE }]);
    const parsed = JSON.parse(file);
    expect(parsed.format).toBe(2);
    expect(parsed.pictures).toHaveLength(1);
    const back = importCardSet(file, "new-subject");
    expect(back.pictures).toHaveLength(1);
    const p = back.pictures[0];
    expect(p.id).not.toBe(set.id);
    expect(p.masks).toHaveLength(4);
    expect(p.subjectId).toBe("new-subject");
    const pics = back.cards.filter((c) => c.type === "picture");
    expect(pics).toHaveLength(4);
    expect(pics.every((c) => c.picture?.set === p.id)).toBe(true);
    expect(back.cards).toHaveLength(5);
    // Plain sets stay format 1.
    expect(JSON.parse(exportCardSet("Plain", [cards[4]], [set])).format).toBe(1);
  });

  it("refuse pictures that are not plain image data", () => {
    expect(safeImage(IMAGE)).toBe(true);
    expect(safeImage("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(safeImage("https://example.com/a.png")).toBe(false);
    const set = heart();
    const cards = syncPictureCards(set, [], 1).save;
    const file = JSON.parse(exportCardSet("Cardio", cards, [set]));
    file.pictures[0].image = "javascript:alert(1)";
    const back = importCardSet(JSON.stringify(file));
    expect(back.pictures).toHaveLength(0);
    expect(back.cards).toHaveLength(0);
  });
});
