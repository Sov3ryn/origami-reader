import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Run against npm run dev. This measures the Chromium renderer, not GPU power.
const browser = await chromium.launch();
const results = [];
const seasonal = process.argv.includes("--seasons");
const scenes = seasonal
  ? ["Spring morning", "Summer evening", "Autumn dusk", "Winter daylight"]
  : ["Moonlit lake"];
try {
  for (const scene of scenes) {
    for (const viewport of seasonal
      ? [{ width: 3840, height: 2160 }]
      : [
          { width: 1480, height: 950 },
          { width: 3840, height: 2160 },
        ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(process.argv[2] || "http://127.0.0.1:1420");
      await page
        .getByRole("button", { name: "Appearance settings", exact: true })
        .click();
      await page
        .getByRole("slider", { name: "Background opacity", exact: true })
        .fill("65");
      await page.getByRole("button", { name: scene, exact: true }).click();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await cdp.send("LayerTree.enable");
      let paints = 0;
      let layers = [];
      cdp.on("LayerTree.layerPainted", () => paints++);
      cdp.on("LayerTree.layerTreeDidChange", (event) => {
        layers = event.layers || [];
      });
      const metrics = async () =>
        Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map(
            ({ name, value }) => [name, value],
          ),
        );
      for (const mode of scene === "Summer evening"
        ? ["static", "animated", "feeding", "hidden"]
        : ["static", "animated", "hidden"]) {
        await page
          .getByLabel("Subtle background motion", { exact: true })
          .setChecked(mode !== "static");
        if (mode === "feeding") {
          await page
            .locator(".fish-feeding")
            .waitFor({ state: "attached", timeout: 23000 });
        }
        if (mode === "hidden") {
          await page.evaluate(() => {
            Object.defineProperty(document, "hidden", {
              configurable: true,
              value: true,
            });
            document.dispatchEvent(new Event("visibilitychange"));
          });
        }
        await page.waitForTimeout(1200);
        paints = 0;
        const before = await metrics();
        const started = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const after = await metrics();
        const seconds = (performance.now() - started) / 1000;
        const animationReasons = [];
        for (const layer of layers) {
          const reasons = await cdp
            .send("LayerTree.compositingReasons", { layerId: layer.layerId })
            .catch(() => ({}));
          for (const reason of reasons.compositingReasons || []) {
            if (reason.includes("animation")) animationReasons.push(reason);
          }
        }
        results.push({
          scene,
          viewport,
          mode,
          seconds: +seconds.toFixed(2),
          mainThreadTaskMs: +(
            (after.TaskDuration - before.TaskDuration) *
            1000
          ).toFixed(2),
          layouts: after.LayoutCount - before.LayoutCount,
          styleRecalculations: after.RecalcStyleCount - before.RecalcStyleCount,
          layerPaints: paints,
          animationReasons: [...new Set(animationReasons)],
          animations: await page
            .locator(".background-art")
            .evaluate((element) =>
              element.getAnimations({ subtree: true }).map((a) => a.playState),
            ),
        });
      }
      await context.close();
    }
  }
  await mkdir(".local", { recursive: true });
  await writeFile(
    seasonal
      ? ".local/season-performance.json"
      : ".local/ambient-performance.json",
    JSON.stringify(
      {
        browser: browser.version(),
        description:
          "Four-second steady-state samples in headless Chromium. Not a GPU-power or TTS-throughput benchmark.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      results.map(({ animations, ...result }) => ({
        ...result,
        animations: animations.length,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
