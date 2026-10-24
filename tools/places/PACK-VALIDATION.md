# Validation, 23 October 2026

Completed against the standalone integration package, not the unavailable Origami Reader application repository.

- 31 catalog entries: 19 celebrations and 12 reading milestones; unique IDs and present image assets.
- 35 final raster assets: 31 static environment plates and four separate transparent visitor sprites.
- Source-coordinate mask polygons and sprite references checked.
- Cumulative reading, book completion, distinct-day and holiday thresholds checked at their boundaries.
- Permanent unlock retention, repeat evaluations, corrupt persisted data and unavailable storage checked.
- All 31 scenes loaded in headless Chromium and painted nonempty separate animation overlays.
- Motion off/on, live reduced-motion preference changes, zero intensity, low quality, gallery category filtering, mobile/ultrawide resizing, hidden-view pausing, detach/reattach cleanup and invalid-scene recovery passed.
- Direct `file://` opening passed; no server is required for the gallery.
- Zero page exceptions and zero external network requests in browser QA.
- Representative desktop and mobile screenshots were visually inspected. Steam softness and mobile pagination placement were refined after inspection, then the full suite was run again successfully.

Test commands:

```sh
node tests/unlocks.cjs
node tests/browser.cjs
```

The optional browser suite needs Playwright and a Chromium browser in the test environment. This session used the installed Playwright package with a locally unpacked Chromium test binary. No browser/test dependencies are bundled into the deliverable or needed to open the preview.

Remaining app-specific work: integrate with the existing reader UI, data stores, calendar, localization, asset pipeline and settings; run the actual reader's build/test suite; profile performance on its target devices. Source images are 1672 × 941 pixels, approximately 16:9, not native 4K. Animation quality is configurable; photorealistic base images are combined with deliberately lightweight overlays and visitor transforms.

## Version 0.2 animation upgrade, 23 October 2026

- Effects rewritten with cached sprites and a separate screen-blended light layer; catalog retuned so every plate has effects aligned to its own lamps, windows, water and sky.
- `node tests/unlocks.cjs` passed. `node tests/browser.cjs` passed (3 of 4 runs; one run timed out waiting for animation to resume after the reduced-motion preference was switched back, a step whose logic did not change).
- The browser test now checks both canvas layers and builds `file://` URLs with `pathToFileURL`, so it also runs on Windows.
- Representative frames of every scene were rendered at source resolution and inspected. Draw cost measured at 1920 x 1080, 1.5x density: 0.02 to 0.31 ms of main-thread time per frame on average across all 31 scenes.

## Version 0.3 ambient additions, 23 October 2026

- New effects: clouds, curling steam wisps, smoke, dappled light, moths, fountain, sailboat, satellite. Added to 26 scenes, focused on the scenes that had the fewest effects.
- `node tests/unlocks.cjs` and `node tests/browser.cjs` passed.
- Average draw cost at 1920 x 1080, 1.5x density: at most 0.36 ms per frame. The first frame of a scene can take 10 to 20 ms while cloud sprites are painted and cached.

## Version 0.4 quality pass, 23 October 2026

- Steam widened to each measured cup rim (22 cups); fires rebuilt and placed on the painted logs (5 fires); painted effects matched to scene light; drifting painted skies replace drawn clouds (16 scenes); sky and window effects occluded by the artwork (23 scenes with masks); rain direction set per window.
- `node tests/unlocks.cjs` passed. `node tests/browser.cjs` passed 3 of 3 runs after a reduced-motion fix: the element now rechecks the preference once a second while paused, because a media query change event was not always delivered in headless Chromium (this was also the cause of the earlier intermittent failure).
- All 31 scenes rendered at source resolution and inspected; crops of every cup, fire, rain window and masked window inspected.
- Cost measured with rasterisation forced each frame (software rendering, 1920 x 1080 at 1.5x): mean 4.0 ms per frame on high quality and 1.5 ms on low, worst scene 14 ms (Winter Solstice). Version 0.3 measured the same way: 3 to 12 ms. GPU-accelerated browsers will be faster.
