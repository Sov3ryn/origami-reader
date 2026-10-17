# Later appearance options

These ideas are recorded for later and do not expand the current release scope.

## Reading lamp

An optional simulated clip-on book lamp: a dark surrounding workspace with a localized pool of light on the page. Adjustable lamp position, warmth, brightness and falloff. The intended feeling is a physical book under a small reading light.

Keep the text readable everywhere. Provide a static mode, honor reduced motion and measure rendering overhead during TTS. Preserve the normal reader and night-paper modes. Do not implement this before the planned reader, speech and export work.

## Later document editing

A richer text editor may follow the reader and Studio. It is not part of the current first-release scope.

## First-run appearance choice

When installer and first-run setup are implemented, offer background motion, opacity and reading-surface choices before opening the Library. Motion is currently on by default for new settings, with operating-system reduced-motion preferences respected. Existing saved choices must be preserved.

## Ideas that would set Origami apart (13 October 2026)

Recorded after the UX review. None of these are scheduled; they build on what already exists (scenes, motion, portraits, local voices) rather than copying other readers.

1. **Scenes that follow the book.** An optional per-book scene, suggested from genre tags (Dracula: winter night, Pride and Prejudice: spring day). Opt-in "atmosphere follows the text": light rain or heavier snowfall in stormy chapters, chosen from local chapter keywords, never from a network service.
2. **Ambient sound for each scene.** Quiet water, wind, night insects or a crackling stove, mixed under narration and lowered automatically while a voice speaks. Each scene and time of day gets its own loop. Off by default, with its own volume.
3. **Wind-down mode.** One button that combines the sleep timer with the scenes: the scene slowly turns to night, the cabin light comes on, the page dims, speech slows by about 5% and the volume fades at the end.
4. **Paper cranes as progress.** Each finished chapter folds a small crane that appears in the scene (on the railing, on the water). Finished books leave a crane on their shelf card. Gentle progress with no streaks or guilt.
5. **Cast the book.** Extend the voice portraits into a per-book cast: the narrator plus voices for quoted dialogue, each shown as a portrait card. This is the friendly front end for the later Studio.
6. **Performance notes.** Export and import a book's spoken versions, pronunciations and cast as one small file, so a carefully tuned listening edition can be shared with friends without sharing the book.
7. **Chapter vignettes.** Optional small paper-style illustrations for chapter openings, painted once by the local image engine in the same style as the covers and cached.
8. **Folded page turns.** In one-page mode, an optional subtle paper-fold transition between pages, honoring reduced motion.
9. **Voicebox companion (planned).** For harness and chat read-aloud, run one shared local speech service that both the reader and the small Voicebox app connect to. The model loads once, both apps share voices and pronunciations, and closing the reader does not unload a voice the Voicebox is using. Give each assistant or chat its own voice, add a global stop hotkey, and read sentence by sentence as text streams in.
