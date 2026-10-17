import { describe, expect, it } from "vitest";
import { providerNames, toEmbed } from "../src/work/embeds/providers";
import { splitKeys } from "../src/work/HoverTips";
import { formatSize } from "../src/updates";

describe("online embeds", () => {
  const cases: [string, string, RegExp][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s", "YouTube", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?rel=0&start=65$/],
    ["https://youtu.be/dQw4w9WgXcQ", "YouTube", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/],
    ["https://www.youtube.com/shorts/abcDEF12345", "YouTube", /embed\/abcDEF12345/],
    ["https://www.youtube.com/playlist?list=PL123abc", "YouTube", /videoseries\?list=PL123abc/],
    ["https://vimeo.com/76979871", "Vimeo", /^https:\/\/player\.vimeo\.com\/video\/76979871\?dnt=1$/],
    ["https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk", "Spotify", /open\.spotify\.com\/embed\/episode\/4rOoJ6Egrf8K2IrywzwOMk/],
    ["https://x.com/nasa/status/1234567890123456789", "X (Twitter)", /1234567890123456789/],
    ["https://www.instagram.com/p/C1a2b3c4d5e/", "Instagram", /instagram\.com\/p\/C1a2b3c4d5e\/embed/],
    ["https://www.reddit.com/r/science/comments/abc123/some_title/", "Reddit", /^https:\/\//],
    ["https://www.figma.com/design/AbC123/My-file", "Figma", /figma\.com\/embed/],
    ["https://codepen.io/team/pen/xyzABC", "CodePen", /codepen\.io\/team\/embed\/xyzABC/],
    ["https://www.desmos.com/calculator/abcd1234ef", "Desmos", /desmos\.com\/calculator\/abcd1234ef\?embed/],
  ];
  it.each(cases)("%s becomes a %s embed", (url, provider, src) => {
    const e = toEmbed(url);
    expect(e?.provider).toBe(provider);
    expect(e?.src).toMatch(src);
    expect(e?.src.startsWith("https://")).toBe(true);
  });

  it("refuses unknown pages unless asked, and never plain http pages or scripts", () => {
    expect(toEmbed("https://example.com/article")).toBeNull();
    expect(toEmbed("https://example.com/article", true)?.kind).toBe("page");
    expect(toEmbed("http://example.com/article", true)).toBeNull();
    expect(toEmbed("javascript:alert(1)", true)).toBeNull();
    expect(toEmbed("not a link", true)).toBeNull();
    expect(toEmbed("https://www.youtube.com/watch?v=<script>")).toBeNull();
  });

  it("lists every supported service once", () => {
    expect(providerNames.length).toBeGreaterThanOrEqual(30);
    expect(new Set(providerNames).size).toBe(providerNames.length);
  });
});

describe("tooltips with shortcuts", () => {
  it("splits a trailing shortcut from the label", () => {
    expect(splitKeys("Underline (Ctrl+U)")).toEqual(["Underline", "Ctrl+U"]);
    expect(splitKeys("Heading 1 (Ctrl+Alt+1)")).toEqual(["Heading 1", "Ctrl+Alt+1"]);
    expect(splitKeys("Search (Ctrl+K / Ctrl+P)")).toEqual(["Search", "Ctrl+K / Ctrl+P"]);
  });
  it("keeps ordinary brackets in the label", () => {
    expect(splitKeys("Notes (optional)")).toEqual(["Notes (optional)", undefined]);
    expect(splitKeys("Bold")).toEqual(["Bold", undefined]);
  });
});

describe("updates", () => {
  it("formats download sizes", () => {
    expect(formatSize(12 * 1024 ** 2)).toBe("12 MB");
    expect(formatSize(1000)).toBe("1 MB");
    expect(formatSize(3.2 * 1024 ** 3)).toBe("3.2 GB");
  });
});
