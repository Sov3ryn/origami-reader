import { beforeEach, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: backend.invoke, isTauri: () => true }));
beforeEach(() => { vi.resetModules(); backend.invoke.mockReset(); localStorage.setItem("origami.devLocks", "1"); });

it("restores a saved grant and leaves achievements on their earned path", async () => {
  backend.invoke.mockResolvedValue({ active: true, id: "returning-reader" });
  const supporter = await import("../src/supporter");
  await supporter.initializeSupporter();
  const { isOpen, unlockedAll, placeOpen } = await import("../src/rewards");
  const { emptyReadingStats } = await import("../src/places");
  const stats = structuredClone(emptyReadingStats);
  expect(isOpen("finish", "gold", stats)).toBe(true);
  expect(placeOpen("any-place", stats)).toBe(true);
  expect(unlockedAll(stats, 0, undefined, true)).toEqual(unlockedAll(stats, 0, undefined, false));
});

it("a late startup response cannot undo a newly activated grant", async () => {
  let complete!: (status: unknown) => void;
  backend.invoke.mockImplementation((name: string) => name === "supporter_status"
    ? new Promise(resolve => { complete = resolve; })
    : Promise.resolve({ active: true, id: "new-reader" }));
  const supporter = await import("../src/supporter");
  const startup = supporter.initializeSupporter();
  await supporter.activateSupporter("valid-key");
  complete({ active: false });
  await startup;
  expect(supporter.supporterActive()).toBe(true);
});

it("a rejected key never unlocks cosmetics and a canceled import preserves activation", async () => {
  const supporter = await import("../src/supporter");
  backend.invoke.mockRejectedValueOnce(new Error("Invalid key"));
  await expect(supporter.activateSupporter("bad-key")).rejects.toThrow();
  expect(supporter.supporterActive()).toBe(false);
  backend.invoke.mockResolvedValueOnce({ active: true, id: "valid" }).mockResolvedValueOnce(null);
  await supporter.activateSupporter("valid-key");
  await supporter.importSupporter();
  expect(supporter.supporterActive()).toBe(true);
});
