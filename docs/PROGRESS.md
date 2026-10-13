# Development progress

Updated 12 October 2026. Version 0.1.0 is an early development build. The approved first release still includes the later reliability, export and integration stages in PRODUCT-PLAN.html.

## Implemented and exercised

- A native Windows Tauri application with a Rust backend, SQLite persistence and a React/TypeScript interface. The same interface has a browser preview using separate IndexedDB data.
- The Library and Reader layouts, independently collapsible/resizable panels, tabbed inspector, selection tools and persistent appearance settings. Unfinished note drafts survive new text selections.
- Library search, sorting, collections, favorites, bulk selection, duplicate detection and recoverable Trash.
- TXT, UTF-8 Markdown, pasted text and unprotected text EPUB imports. EPUB order follows its spine. Embedded active content is inert. Current limits are 32 MB input and 64 MB expanded EPUB content; larger files are rejected explicitly.
- Chapter navigation, bounded passage rendering, saved narration position, colored underlines, bookmarks, margin notes, grouping, search and annotation export. Stable paragraph/text-offset anchors survive font and theme changes.
- Twelve app palettes plus independent paper, white, sepia and night reading surfaces. Paper texture and background motion can be disabled; reduced-motion preferences are respected.
- A faceted lavender crane derived from the first approved mockup, used for the interface and native app icon. Optional moonlit lake artwork.
- A voice catalog with language, voice gender and style filters, name/accent search, favorites and sorting. This local installation has eight existing English voice profiles. The catalog supports adding other languages through metadata; no multilingual catalog or voice pack is distributed yet.
- An isolated local Qwen worker with passage-by-passage synthesis, one-passage read-ahead, pause, stop, seek within the current passage, speed/volume and passage highlighting. Only current and nearby playback audio is retained in memory.

## Validation evidence

Windows is the only native runtime exercised so far. Linux source support and Windows/Ubuntu CI definitions are present, but CI has not run and no Linux installation was available for native testing. M0's Linux, packaging and full assistive-technology gates remain open.

The final Windows check passed 8 TypeScript unit tests, 3 Rust storage tests and 5 browser workflow tests. The production frontend and native executable builds also succeeded. The suite covers document normalization and bounded speech segmentation (including a one-million-character fixture), voice filtering, SQLite persistence, annotation durability, import order and inert content, Trash/restore, appearance persistence and keyboard operation. Automated axe checks pass for the tested default Library and Reader views. This does not certify every theme or replace screen-reader testing.

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
