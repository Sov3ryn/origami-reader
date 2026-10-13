# Development progress

Updated 12 October 2026. Version 0.1.0 is an early development build. The approved first release still includes the later reliability, export and integration stages in PRODUCT-PLAN.html.

## Implemented and exercised

- A native Windows Tauri application with a Rust backend, SQLite persistence and a React/TypeScript interface. The same interface has a browser preview using separate IndexedDB data.
- The Library and Reader layouts, independently collapsible/resizable panels, tabbed inspector, selection tools and persistent appearance settings. Library and Settings hide the inspector and its resize handle without changing the reader's saved panel state. The Library appearance shortcut opens Settings. Unfinished note drafts survive new text selections.
- Library search, sorting, collections, favorites, bulk selection, duplicate detection and recoverable Trash.
- TXT, UTF-8 Markdown, pasted text and unprotected text EPUB imports. EPUB order follows its spine. Embedded active content is inert. Current limits are 32 MB input and 64 MB expanded EPUB content; larger files are rejected explicitly.
- Chapter navigation, bounded passage rendering, saved narration position, colored underlines, bookmarks, margin notes, grouping, search and annotation export. Stable paragraph/text-offset anchors survive font and theme changes.
- Twelve app palettes plus independent paper, white, sepia and night reading surfaces. Reading page width is adjustable from 600 to 2200 pixels, with a full-width option; it always fits the available reader space. Paper texture and background motion can be disabled; reduced-motion preferences are respected. Background thumbnails retain their image on hover, with an outer accent frame and a small preview zoom.
- A faceted lavender crane derived from the first approved mockup, used for the interface and native app icon. Optional moonlit lake artwork.
- Background opacity from 0 to 100 percent affects only the artwork and decorative overlays. Twelve brighter petals drift from right to left with a gentle downward fall. Two lake-mist layers, two mountain-fog layers, three small ripple patches, a softly fluctuating cabin glow and an occasional cloud across the moon use compositor transforms and opacity. Every effect has a switch. A shared aspect-ratio stage keeps the overlays aligned with the artwork through window resizing and cropping. Motion defaults on for new settings; an existing saved off preference remains off. Hidden windows pause all 21 animations; reduced-motion mode hides the overlays. Zero opacity and the None scene remove them entirely. There is no video decoder, full-scene frame sequence or per-frame React update.
- A voice catalog with language, voice gender and style filters, name/accent search, favorites and sorting. This local installation has eight existing English voice profiles. The catalog supports adding other languages through metadata; no multilingual catalog or voice pack is distributed yet.
- An isolated local Qwen worker with passage-by-passage synthesis, one-passage read-ahead, pause, stop, seek within the current passage, speed/volume and passage highlighting. Only current and nearby playback audio is retained in memory.

## Validation evidence

Windows is the only native runtime exercised so far. Linux source support and Windows/Ubuntu CI definitions are present, but CI has not run and no Linux installation was available for native testing. M0's Linux, packaging and full assistive-technology gates remain open.

The foundation Windows check passed 8 TypeScript unit tests, 3 Rust storage tests and 5 browser workflow tests. The expanded ambient-background update passed the 8 TypeScript tests and 9 browser workflows. New checks cover default-on motion, all effect toggles, opacity persistence, hidden-page pause, reduced motion, thumbnail hover, inspector visibility and restoration, page-width persistence and narrow-window fitting, scene alignment at three aspect ratios, and leftward petal motion. The production frontend and native executable builds also succeeded. The suite covers document normalization and bounded speech segmentation (including a one-million-character fixture), voice filtering, SQLite persistence, annotation durability, import order and inert content, Trash/restore, appearance persistence and keyboard operation. Automated axe checks pass for the tested default Library and Reader views. This does not certify every theme or replace screen-reader testing.

The ambient renderer was profiled in headless Chromium at 1480 x 950 and 3840 x 2160. Four-second steady-state samples recorded zero layouts, style recalculations and layer paints with all effects enabled. Chromium reported accelerated transform/opacity animations; all 21 animations were paused in the hidden-page check. These are renderer checks, not GPU-power measurements, native Linux validation or a TTS-throughput comparison. Run `npm run dev`, then `node scripts/measure-ambient.mjs` to repeat. Results are saved in .local/ambient-performance.json, with the latest checked sample copied to docs/ambient-performance.json. The implementation follows the [browser animation performance guidance](https://web.dev/articles/animations-guide) to animate transforms and opacity without continuously repainting the underlying artwork.

The native Windows app loaded all eight local voice profiles, synthesized actual WAV output, played through the UI, paused and sought within a passage. On the development machine's NVIDIA GeForce RTX 4080 SUPER, one short cold synthesis took 9.06 seconds and produced 3.28 seconds of audio. The next warm synthesis took 0.65 seconds and produced 1.84 seconds of audio. These are small smoke-test samples, not sustained audiobook benchmarks or promises for other hardware. Catalog language, gender, style, search and favorite controls were also exercised in the native WebView.

## Open work, in dependency order

1. Complete M0 on a named Linux distribution, including native selection, keyboard/accessibility, WebKitGTK audio, seek, worker cancellation and packaging. Review the actual shell with the user before expanding the full reader.
2. Finish M1-M6: per-workspace panel restoration, document tags and metadata editing, PDF/DOCX import and source views, document search, full paged/scroll navigation, anchor recovery after source edits and annotation undo.
3. Finish M7-M10: engine/model management, portable voice-pack import and previews, multilingual synthesis selection, reversible spoken-text cleaning and pronunciation, selected-passage repair with accepted takes, and long-session playback tests.
4. Implement M11-M12: persistent resumable generation jobs, bounded disk cache, protected audio and complete WAV/MP3/chaptered M4B exports and project backups.
5. Implement M13-M16: explicit chat/clipboard/browser integrations, backed-up migration, fresh-install tooling, broader accessibility, sleep timer, mini-player and media keys.

The current speech worker returns one bounded passage at a time. Raw model-chunk audio streaming, persistent audio takes, whole-book timeline seeking and an audio export pipeline are not implemented yet. Stop terminates Origami's worker; the next playback reloads it. Worker timeouts and idle unloading remain to be added.

The existing Maeve app remains independent, including its hooks, data and manually exported audio. Local development references its existing model/runtime without installing into or upgrading that environment. Copied voice references, local paths and test audio are ignored by Git. No GitHub remote or public release has been created.

## Deferred ideas

The simulated clip-on reading lamp is recorded in IDEAS.md. Multi-character Studio, speaker detection and naming, voice creation, system sound capture and a richer editor remain later scope.
