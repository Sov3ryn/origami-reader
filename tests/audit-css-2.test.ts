import { describe, expect, it } from "vitest";
import { darkReadingRoom, themes, themeScheme } from "../src/themes";

describe("themeScheme", () => {
  it("reads 3 and 6 digit backgrounds", () => {
    expect(themeScheme("#fff")).toBe("light");
    expect(themeScheme("#000")).toBe("dark");
    expect(themeScheme("#eeeae3")).toBe("light");
    expect(themeScheme("#151418")).toBe("dark");
    expect(themeScheme("not a colour")).toBe("dark");
  });

  it("agrees with darkReadingRoom on which themes are light", () => {
    for (const theme of themes) {
      const room = darkReadingRoom(theme);
      if (room) {
        expect(themeScheme(theme.bg)).toBe("light");
        expect(room.colorScheme).toBe("dark");
      }
    }
  });
});
