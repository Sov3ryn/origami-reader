# Origami

A local desktop reader and text-to-speech workspace for Windows and Linux. MIT-licensed source code. This is an early development build, not the completed first release.

![Library](docs/screenshots/library.png)

## Available now

- Library with search, sorting, collections, favorites, bulk selection and recoverable Trash.
- Create or delete collections from the sidebar, including empty collections. Deletion moves their books to Unsorted and offers Undo. New imports use the selected collection; Reader details can change a document's collection.
- TXT, UTF-8 Markdown and unprotected text EPUB import. Quick Read for pasted text.
- Reader with chapter navigation, saved narration position, bounded page rendering and adjustable page width, including full width.
- Twelve annotation colors, margin notes, bookmarks, grouping and annotation export. Search note wording and source paragraphs, filter by type/color or book, and sort alphabetically or by position in the book. Note and bookmark jumps keep one temporary return marker until it is used, dismissed or the app closes.
- Editable spoken versions for selected passages, with explicit Save, Reset and an unsaved preview. Saved wording and skipped passages persist while original book text and annotation anchors remain intact. Roman heading numbers are normalized for speech by default, with a reversible setting; manual replacements take priority.
- Independently collapsible/resizable panels and a contextual tabbed inspector. Library keeps the full workspace without an inspector.
- Twelve app palettes; separate white, paper, sepia and textured night reading surfaces.
- Page brightness from 50% to 150%, applied to the paper and texture while text and controls keep their colors. Each scene remembers its paper brightness.
- Background opacity control, windblown petals, mountain fog, lake mist and ripples, subtle cabin lights and an occasional cloud across the moon. Each effect can be switched off. Motion defaults on for new settings, respects reduced motion and pauses while hidden.
- Four seasonal versions of the lake: spring morning, summer evening, autumn dusk and winter daylight. Brighter fireflies, denser petals, leaves and snowfall, and occasional summer fish-feeding rings. Scenes remember their own palette, reading surface, texture, opacity and effects.
- Optional automatic scene selection by local season, with northern/southern hemisphere support, or a different lake scene at each startup.
- Windows desktop SQLite persistence. Browser preview uses separate IndexedDB storage.
- Optional isolated Qwen worker, passage playback, pause, stop, passage seek, speed/volume and one-passage read-ahead.
- Optional startup preloading of the last voice used for playback. Opening a book preserves an idle loaded model. Closing the app stops its speech worker and releases its GPU resources.
- Voice catalog with language, voice gender and style filters, accent/name search, favorites and sorting.
- Selecting a new voice immediately unloads the previous worker. Play repeats the current sentence using the new voice, without selecting text again. Optional startup default-voice randomization stays within the last selected language.
- Change covers from the Library cover's hover button or Reader details. Import embedded EPUB artwork, upload a raster cover, or generate local SD-Turbo artwork. Missing-cover generation defaults on and can be disabled; the image model exits after each job.
- Reader focus mode toggles to a collapse icon and restores saved panel widths and visibility.

No cloud account is required. Voice models and reference recordings are not included. Linux source/build support is provided; Linux execution has not yet been validated on the development machine. See [progress](docs/PROGRESS.md) for exact test status and limitations.

## Background settings

In Appearance, Background selection offers Manual, Current season, and Random at startup. Seasonal mode uses the local calendar, changing in March, June, September and December. It rechecks at midnight and when the window returns to view. Random mode selects from the five illustrated lake scenes on the next launch and avoids repeating the previous scene. Choosing a thumbnail returns to Manual mode.

These defaults apply to new scenes. Existing saved choices are preserved; use Reset scene defaults to restore a scene's preset. Reading surfaces remain editable independently of the app palette. Text size, line spacing and page width remain shared reader settings.

| Scene | App palette | Reading surface | Background opacity |
| --- | --- | --- | --- |
| Moonlit lake | Plum Nocturne | Night | 50% |
| Spring morning | Forest Ink | Sepia | 50% |
| Summer evening | Burgundy Velvet | Sepia | 60% |
| Autumn dusk | Copper Hearth | Sepia | 65% |
| Winter daylight | Paper White | Paper | 85% |

All presets enable paper texture and available motion effects. The opacity slider runs from transparent on the left to opaque on the right. Fish-feeding rings appear at varied open-water locations roughly every 28 to 55 seconds, with a shorter first wait. Each effect can be disabled. Hidden windows and reduced-motion preferences suspend the decorative motion and fish-event timer.

## Development

Use Node 24 or newer, a current stable Rust toolchain and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows needs the MSVC build tools and WebView2. Linux requires the documented WebKitGTK and build packages.

```sh
npm ci
npm run desktop:dev
```

For the browser preview:

```sh
npm run dev
```

Open the printed localhost address. Browser preview supports library and annotation workflows; speech generation runs in the desktop app.

## Local speech

See [speech setup](docs/LOCAL-SPEECH.md). The model manager and packaged dependency installation are still planned. Without a configured engine the reader remains usable.

See [cover generation setup](docs/COVER-GENERATION.md) for local artwork. Powered by Stability AI. This optional model retains its own license and is excluded from the source repository.

## Checks and builds

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --no-bundle
```

Windows/Linux CI is defined in .github/workflows/ci.yml. It does not run until the repository is hosted with Actions enabled. The browser checks do not certify Linux WebKitGTK, audio devices, assistive technology or GPU inference.

## Project structure

- src: interface, document normalization, storage adapter and player controller.
- src-tauri: desktop commands, SQLite storage and worker lifecycle.
- workers: versioned, isolated local speech protocol.
- tests and e2e: document, persistence and real UI workflow checks.
- docs: product plan, implementation progress, setup and deferred ideas.

## Roadmap and contributions

Follow the [first-release plan](docs/PRODUCT-PLAN.html). The next work is document fidelity, persistent audio jobs, selected-passage repair, complete audiobook export, model setup and opt-in integrations. Studio, automatic character attribution, voice creation, system sound capture and a richer text editor come later.

Changes should include validation appropriate to the behavior. Maintain platform adapters and preserve local files. Never add personal voice recordings, model weights, tokens or runtime configuration to Git. Keep interface copy direct and descriptive.

## License and assets

App source: [MIT](LICENSE). Dependencies retain their licenses. Model weights, voice references and user documents have separate terms and are not relicensed by this repository. The current demo passages are original text with fictional author names. See [asset provenance](docs/ASSETS.md).

Six complete text EPUBs are prepared in [the starter-library pack](assets/starter-library/README.txt) for the planned preloaded library. See its [rights record](assets/starter-library/RIGHTS.txt) and source manifest before redistributing. These historical texts have been reviewed for the US, Canada and UK; this is not a worldwide copyright clearance. Third-party covers and fonts are excluded. The pack can be imported now and has not replaced existing libraries or the current demo seed.

The project does not modify or take over an existing Maeve installation.
