import { describe, expect, it } from "vitest";
import { detectLanguage, languages, loadLanguage, t } from "../src/i18n";
import source from "../src/locales/source.json";

describe("interface language", () => {
  it("matches the operating system language to the closest translation", () => {
    expect(detectLanguage(["fr-CA", "en-US"])).toBe("fr");
    expect(detectLanguage(["pt-PT"])).toBe("pt-BR");
    expect(detectLanguage(["zh-Hans-CN"])).toBe("zh-CN");
    expect(detectLanguage(["zh-TW", "ja-JP"])).toBe("ja");
    expect(detectLanguage(["sw-KE"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });
  it("offers twenty languages, each with a flag", () => {
    expect(languages).toHaveLength(20);
    for (const language of languages) expect(language.flag).toBeTruthy();
    // English uses the combined United Kingdom and United States flag.
    expect(languages.find((l) => l.code === "en")?.flag).toBe("en");
  });
  it("fills placeholders and falls back to English", async () => {
    await loadLanguage("en");
    expect(t("Sleep timer: {minutes} min left", { minutes: 12 })).toBe(
      "Sleep timer: 12 min left",
    );
    expect(t("Not in the catalog")).toBe("Not in the catalog");
  });
  it("translates and sets the page direction for right-to-left languages", async () => {
    await loadLanguage("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(t("Library")).not.toBe("Library");
    await loadLanguage("fr");
    expect(document.documentElement.dir).toBe("ltr");
    expect(t("Library")).toBe("Bibliothèque");
    await loadLanguage("en");
  });
  it("keeps the source catalog free of duplicates", () => {
    expect(new Set(source).size).toBe(source.length);
  });
});
