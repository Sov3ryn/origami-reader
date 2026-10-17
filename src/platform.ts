// Display-only platform details. Behavior stays the same on every system:
// shortcuts accept both Ctrl and Cmd.
const agent =
  typeof navigator === "undefined"
    ? ""
    : (
        (navigator as Navigator & { userAgentData?: { platform?: string } })
          .userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent
      ).toLowerCase();

export const platform: "mac" | "windows" | "linux" = agent.includes("mac")
  ? "mac"
  : agent.includes("win")
    ? "windows"
    : "linux";

export const systemName =
  platform === "mac" ? "macOS" : platform === "windows" ? "Windows" : "Linux";

export function keyLabel(key: string) {
  if (platform !== "mac") return key;
  return { Ctrl: "⌘", Shift: "⇧", Alt: "⌥", Esc: "esc" }[key] || key;
}
