import { it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { libraryThemes, libraryTheme } from "../src/libraryThemes";

it("every ready room theme ships its rendered room", () => {
  for (const theme of libraryThemes.filter((t) => t.kind === "room" && t.status === "ready")) {
    const dir = "public" + theme.base;
    for (const f of ["scene.json", "bg_day.webp", "bg_night.webp", "bg_night_dim.webp", "light_day.png", "light_night.png", "light_night_dim.png", "preview_day.webp", "preview_night.webp"])
      expect(existsSync(dir + f), dir + f).toBe(true);
    const scene = JSON.parse(readFileSync(dir + "scene.json", "utf8"));
    expect(scene.shelves.length).toBeGreaterThan(0);
    expect(scene.occluders.length).toBeGreaterThan(0);
  }
});
it("unknown or unfinished themes fall back to the classic library", () => {
  expect(libraryTheme("nope").id).toBe("classic");
  expect(libraryTheme("cabin").id).toBe("classic");
  expect(libraryTheme("mansion").kind).toBe("room");
});
