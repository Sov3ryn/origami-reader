# Origami: Places to Read

31 finished background plates (19 celebrations, 12 reading milestones), separate animation overlays, four transparent visitor sprites, an offline gallery, and permanent-unlock helpers.

**Status:** this is a portable integration package. Origami Reader's application repository was not available in this session, so the app itself has not been modified. This preview is separate from the reader UI.

## Open the preview

Extract the entire ZIP and open `index.html` in a modern desktop browser. Keep the files and `assets/` folder together. No account, internet connection, build step, or installation is needed. Alternatively run `python3 -m http.server 8091` inside this directory and open `http://localhost:8091`.

The preview allows every scene to be selected without changing or inventing reading progress. The reading panel is an example; its visibility can be toggled to inspect the artwork. Browsing the gallery never awards achievements.

## Integrate into a web-based reader

Copy `scene-data.js`, `catalog.js`, `origami-backgrounds.js` and `assets/` (including `assets/masks/`) into the reader's static assets. Load the scene data, then the catalog, then the component:

```html
<script defer src="/backgrounds/scene-data.js"></script>
<script defer src="/backgrounds/catalog.js"></script>
<script defer src="/backgrounds/origami-backgrounds.js"></script>

<origami-background
  id="reading-background"
  scene="lunar-new-year"
  motion="on"
  intensity="0.65"
  quality="auto"
  style="position:fixed;inset:0;z-index:0"
></origami-background>
```

Keep the reader UI above the decorative background, with an opaque or translucent reading surface. The element's image and canvas do not intercept pointer events. Its styles are scoped to its shadow root; `preview.css` is **only** for the standalone gallery and should not be loaded into the reader.

```js
const background = document.getElementById('reading-background');
background.scene = 'last-bloom';
background.motion = false;
background.setAttribute('quality', 'low');
background.setAttribute('intensity', '0.45');
background.setAttribute('fireworks', 'off');
background.addEventListener('scene-error', ({detail}) => {
  // Fall back to an existing built-in scene if an asset is missing.
  console.warn('Background asset unavailable:', detail.id);
});
```

If the reader uses React, Vue, Svelte, or another web framework, render this custom element in the existing background container and update its attributes from the app's preferences. If the reader has a native renderer, reuse the PNGs, catalog coordinates, thresholds, and effect descriptions; the canvas renderer needs a native adapter. No assumption has been made about the reader's framework.

For a bundler/CSP that cannot load these classic scripts, adapt them to the app's existing module and asset pipeline. `catalog.js` resolves images relative to its own script URL; preserve that location or override the catalog image URLs with `background.useScene({...entry, image: appAssetUrl})`. Load the component scripts once per page. Do not build a second reading-time tracker if the app already has one.

## Achievement integration

All proposed thresholds are catalog data and can be changed before release. The host app supplies **cumulative, authoritative** counters, so re-evaluating a snapshot does not add time or award a milestone twice:

```js
const rewards = new OrigamiBackgrounds.UnlockStore();
const newlyEarnedIds = rewards.update({
  activeSeconds: readerStatistics.activeReadingAndListeningSeconds,
  completedBooks: readerStatistics.uniqueCompletedBookCount,
  distinctReadingDays: readerStatistics.localReadingDayCount,
  holidaySeconds: readerStatistics.cumulativeEligibleHolidaySecondsById
});
// newlyEarnedIds contains only rewards newly earned on this update.
// Query rewards.has(sceneId) when building the app's theme selector.
// Save selection with the reader's existing preference mechanism.
```

Count active reading or TTS listening equally; do not count idle app time, and do not double-count simultaneous reading and narration. A book-completion counter should count distinct books, not repeated completion events. Reading days are cumulative local calendar days; no daily streak is required.

The package deliberately does **not** guess lunar/religious holiday dates or infer a user's religion/country. The host calendar supplies eligible holiday windows and accumulates their active seconds. Holiday unlocks use 20 eligible minutes. To avoid waiting a year after missing an event, each holiday also has a configurable lifetime-hours fallback (30–66 hours in this draft). Accumulate eligible time across occurrences; earned scenes never expire. Use an explicitly selected region/calendar in the app, not automatic geolocation.

`UnlockStore` stores earned IDs locally under `origami.backgroundUnlocks.v1`. Storage failures leave in-memory rewards usable and expose `store.error`; the host can surface or handle persistence problems. You can pass an existing synchronous `{getItem, setItem}` storage adapter, or call `evaluateUnlocks(catalog, progress, previousIds)` and persist its result through the app's own database. Unlock enforcement belongs to the host theme selector; the renderer itself can display any supplied scene for preview/testing.

## Artwork and animations

The 31 source plates are 1672 × 941 PNGs (approximately 16:9), **not native 4K**. Four visitor PNGs preserve alpha. Images were produced with the built-in image-generation tool; `generation-prompts.json` preserves the scene prompts. Original source plates remain unchanged by runtime animation.

All movement is a separate transparent canvas overlay. Masks, holes, anchors and paths are normalized to source-image coordinates and use the exact same centered `cover` transform as the photograph. This keeps steam attached to cups and effects aligned when the viewport crops. Extreme portrait/ultrawide crops naturally hide some peripheral effects.

Implemented effects (version 0.4): colour fireworks with rising shells and four burst types (peony, chrysanthemum, willow, ring) that leave streaks and droop as they fade; Chinese sky lanterns; swaying silk lanterns with tassels and warm glow; shaped petals, maple and autumn leaves that tumble and flip; two-sided confetti; twisting ribbons; snow with depth and wind; layered slanting rain with drops that bead and slide down window glass; water ripples with twinkling light glints; fireflies that wander and blink; twinkling stars and an occasional shooting star; soft aurora curtains made of shimmering rays; colourful winged butterflies; koi and silhouette fish with swimming tails; rising bubbles; sun or water light shafts; drifting mist; small flocks of birds or bats; candle flames; hearth and campfire fires built from layered, flaring flame sheets with an ember bed, loose licks and sparks; gentle flicker on lamps already painted in the artwork; steam that rises across the whole rim of each cup, teapot and censer; slow incense and campfire smoke; the painted clouds themselves drifting slowly across each sky; dappled sunlight moving on the ground; moths circling lamps; a fountain spilling water; a sailboat crossing the horizon; a satellite gliding past; a glowing cauldron; distant passing lights and trackside lamps for the train; folded paper cranes and floating books with turning pages; breathing animal sprites and an occasional maintenance-robot pass. These remain calm, lightweight 2D overlays rather than animated 3D scenes: the train's landscape is not scrolled, the planet is not rotated and the visitor sprites use restrained transform animation. Emissive effects (lights, flames, fireworks, aurora, glints) draw on a second canvas blended with `screen`, so they brighten the artwork the way real light does. Painted effects (butterflies, leaves, boats, ribbons, rain, snow, smoke) are multiplied by the plate's local light, read from a coarse ambient colour grid, so they take on the scene's brightness and tint. Effects seen through windows or against the sky sit on their own layers, and the plate is drawn again on top with that opening cut out by a CSS mask, so walls, frames, mullions, posts and trees cover them at no per-frame cost. Rain slants away from the glass towards the room. Each effect is a pure function of time, so still frames, resumed animation and reattached elements always agree. Masks, the filled sky behind drifting clouds and the ambient grid are generated from the plates by `tools/build-scene-data.cjs` (settings in `tools/scene-masks.cjs`; needs Playwright like the browser test) and stored in `scene-data.js` and `assets/masks/`. The catalog still works without them: effects are then unmasked and the sky stays still. The national-day plate depicts Canada; other country artwork has not been generated.

The renderer caps canvas density to 1.5× and animation to 30 fps, or 1×/20 fps in low quality. Automatic quality uses a conservative CPU-core heuristic, not a GPU benchmark. Motion stops for reduced-motion preferences, hidden documents, offscreen elements, and disconnected elements. Disabled motion leaves static animal sprites visible; fireworks and weather disappear. There is no audio and no external font/CDN/network dependency. Performance still needs profiling inside the real reader on its low-end targets.

## Content inventory

### Celebrations

New Year’s; Lunar New Year; Valentine’s Day; Carnival/Mardi Gras; Nowruz/Spring Equinox; Easter; Earth Day; Ramadan; Eid al-Fitr; Summer Solstice/Midsummer; Saint-Jean-Baptiste; Canada Day; Thanksgiving/Harvest; Halloween; Día de Muertos; Diwali; Hanukkah; Christmas; Winter Solstice.

### Reading milestones

| Place | Achievement | Requirement |
|---|---|---|
| The Rainy Bookshop | Make Yourself at Home | 1 hour |
| The Midnight Express | One More Chapter | 1 completed book |
| The Fox’s Retreat | A Familiar Place | 7 reading days |
| The Tidal Library | Finding Your Rhythm | 5 hours |
| The Glasshouse | Room to Grow | 3 completed books |
| The Snowbound Observatory | A Wider World | 10 hours |
| The Lantern Garden | Little Rituals | 15 reading days |
| The Sunken Archive | Beneath the Surface | 25 hours |
| The Last Bloom | Stories Take Root | 10 completed books |
| The Orbital Reading Room | Far From Home | 50 hours |
| The Origami Valley | A Thousand Folds | 30 reading days |
| The Impossible Library | Between Worlds | 100 hours |

## Validation

Run `npm test` (or `node tests/unlocks.cjs`) for inventory, asset references, masks, thresholds, persistence, corrupt data and unavailable storage checks. No dependencies are required for these tests.

Optional browser checks: install Playwright in your test environment, install its Chromium browser, then run `node tests/browser.cjs`. The browser suite checks all scenes, canvas painting, controls, reduced motion, low quality, gallery filters, mobile/ultrawide layout, detach/reattach cleanup, unknown scenes, direct file opening, and external requests. `VALIDATION.md` records this package's actual test results.

## Before merging into Origami Reader

Connect the renderer to the existing theme selector, preferences, localization, holiday calendar, achievement database, and asset bundler. Run the reader's build and its normal checks. Check effects behind the actual reader panels and profile target hardware. None of those app-specific integration steps could be performed without the source repository.
