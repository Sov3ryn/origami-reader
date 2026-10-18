# Studio phase 0 results

17 October 2026. Experiments that decide the uncertain choices in [STUDIO-PLAN.html](STUDIO-PLAN.html) before any Studio feature is built. Development PC: RTX 4080 SUPER 16 GB, Ryzen 9 7950X3D, 64 GB, Windows 11. Scratch code, models and outputs live in `work/studio-phase0` (outside Git); the reusable dialogue and attribution code is in `src/studio` with tests in `tests/studio-dialogue.test.ts`. Nothing here runs on macOS or Linux yet.

## Summary

| Experiment | Verdict | Key result | Plan consequence |
| --- | --- | --- | --- |
| Batched fast rendering | GO | Qwen3-TTS 1.7B, 8 lines of one voice per step: 10.6x real time (RTF 0.094), 6.6 GB; today's path 3.0x | A 10-hour book renders in about 1 hour on this PC instead of 3.5 |
| Emotion and delivery | Partly | Instructions are ignored by cloned voices; mood references change delivery but drift slightly from the voice | Phase 3 ships pace and pauses first; mood references as an option with a voice-match check |
| Second voice engine | Not now | Chatterbox and VoxCPM2 clone as well as Qwen but are 6 to 12 times slower; French accuracy no better | Qwen3-TTS stays the only Studio engine |
| Laptop voices | GO, to confirm on a laptop | qwentts.cpp keeps the same Qwen voices at about real time on 4 cores; Pocket TTS is faster (3.5x) but less faithful | Laptops can render the real cast; qwentts.cpp may replace the Python worker |
| Transcription (Parakeet in Rust) | GO, 1 condition | 1.9% word error in English, 3.7 to 4.6% in French, 28x real time on 4 threads | Default long-form transcriber; we make our own int8 model file |
| Typesetting (Typst) | GO, 3 conditions | 398-page novel in 0.8 s, 60 ms after an edit; French spacing correct throughout | Typst is the PDF engine; spread balancing and PDF/X are later work |
| Audiobook files | GO | AAC through Windows, M4B chapters read by 3 independent tools, MP3 with chapters, ACX values pass | Phase 1 export path confirmed |
| Watermark | GO, conditions | AudioSeal survives AAC and MP3 down to 64 kbps; not speed changes | Ship with metadata; blind listening test first |
| Speaker attribution | GO | Rules + Ministral 3 8B with an automatic cast list: 92 to 97% of lines right before any review, about 3 minutes per 10 chapters on the GPU | Ministral 3 replaces Qwen3.5 as the analysis model; rules give the auto-accepted anchors |

## 1. Batched fast rendering

The fast path Origami uses today (faster-qwen3-tts, CUDA graphs) renders one line at a time. `work/studio-phase0/tts/batched_fast.py` captures the same CUDA graphs for a batch of lines spoken by one voice: left-padded prefill, one shared cache position, a padding mask and rope offset per line, and each line ends on its own end token or token budget.

64 random sentences from Pride and Prejudice (5.3 minutes of audio), one designed voice:

| Run | Real-time factor | Speed | Peak memory | Word error (Whisper small, CPU) |
| --- | --- | --- | --- | --- |
| Today's fast path, one line at a time | 0.329 | 3.0x real time | 4.7 GB | 2.6% (1 line lost its start) |
| Batched, 8 lines | 0.094 | 10.6x | 6.6 GB | 1.9% |
| Batched, 16 lines | 0.086 | 11.6x | 10.8 GB | 1.8% |
| Batched, 8 lines, Qwen3-TTS 0.6B | 0.093 | 10.7x | 4.6 GB | 2.6% |

- With a batch of one and the same seed, the batched code produces exactly the same audio as today's path, which confirms the implementation.
- Remaining word errors are the checker's spellings (Bennet and Bennett, sixteen and 16).
- Early endings are rare and random in both paths: one line in about 160 one at a time, three in about 220 batched, and 0 in 48 repeated tries of the line that failed. The automatic take check will catch and retry them.
- On a 16 GB card batches of 8 are the sweet spot; batch size must adapt to free memory. The standard (non-graph) path with 16 lines overflowed 16 GB.
- Decoding codes to audio is now about 20% of the time and is still per line; batching it is a cheap further gain.
- 0.6B and 1.7B run at the same speed here: the limit is per-step overhead, not model size. Mid-range cards will favour 0.6B.

## 2. Emotion and delivery

Two designed voices (Mara, Finn), five emotions (angry, whispered, sad, joyful, fearful), four methods. Voice match is measured with a speaker-verification model (WavLM base plus SV, evaluation only). Calibration on 42 designed voices: the same voice scores about 0.96; two different voices of the same gender average 0.81; different genders 0.35.

| Method | Voice match (mean) | Effect on delivery |
| --- | --- | --- |
| Normal voice, no direction | 0.96 to 0.97 | baseline |
| Written instruction ("speak angrily") | 0.97 | pitch, loudness and pace barely move: ignored, as the publisher warns |
| Mood reference (voice designer makes "the same voice, angry", then the clone reads the line) | 0.90 to 0.92 | real changes: angry Mara pitch 205 to 394 Hz, sad Finn 251 to 130 Hz, whispers slower |
| Voice designer reads the line directly | 0.90 to 0.94 | similar to mood references |

- Qwen's own speaker embedding cannot tell voices apart (two different women score 0.98), so it cannot be used for casting distance or drift detection. Studio needs a real speaker-verification model; 3D-Speaker CAM++ (Apache-2.0, ONNX) is the candidate.
- An emotion classifier trained on acted human speech labelled almost everything "angry" and is not usable on synthetic voices.
- A listening page with all samples (`.local/studio-phase0/voice-tests.html`, not in Git) is waiting for the owner's ears.

## 3. Second voice engine

The same two French designed voices and one English voice, cloned by each engine (16 French lines from Dumas and Verne, 16 English lines).

| Engine | Speed (this PC) | French word error | English word error | Voice match | Memory |
| --- | --- | --- | --- | --- | --- |
| Qwen3-TTS 1.7B, batched | 7.3x real time (French), 8.4x (English) | 12.5 to 13.1% | 5.2% (one early ending) | 0.97 to 0.98 | 6.8 GB |
| Chatterbox Multilingual V3 (MIT) | 1.2 to 1.3x | 15.7 to 17.4%, some garbled words | 0.8% | 0.97 to 0.98 | 3.6 GB |
| VoxCPM2 (Apache-2.0) | 0.6 to 0.7x | 12.1 to 13.1% | 0.4% | 0.97 to 0.98 | 6.2 GB |

French word error is inflated by the small checker model (it writes numbers as digits and mishears old tenses); the comparison between engines is what counts. Chatterbox's emotion slider (exaggeration 0.3 to 1.1) is in the listening page for comparison.

## 4. Laptop voices

Processor only, limited to 4 threads to imitate a laptop (this desktop's cores are faster than a laptop's, so expect roughly half these speeds on a typical laptop).

| Engine | Speed (4 threads) | Word error | Voice match to the designed voice | Notes |
| --- | --- | --- | --- | --- |
| Pocket TTS (Kyutai, CC-BY-4.0), English, cloning the designed voice | 3.5x real time | 0.4% | 0.94 average, a few lines down to 0.79 | 100M parameters; cloning weights are gated on Hugging Face |
| Pocket TTS, French built-in voice (no cloning) | 3.8x real time | 18.4% (Qwen: 12.5 to 13%) | not applicable | 217 MB download, ungated |
| Qwen3-TTS 0.6B (PyTorch, 4 threads) | 0.18 to 0.3x | | 0.97 | measured before phase 0: days for a whole book |
| **qwentts.cpp, Qwen3-TTS 0.6B (MIT, GGML), 4 cores** | **1.1x real time (Q8, 1.0 GB), 1.2x (Q4, 0.6 GB)** after an 11 s model load | **0.4%** | **0.97, the same voices as the GPU path** | builds on Windows with Visual Studio; no prebuilt Windows binaries; no Python or PyTorch; the Vulkan build (laptop graphics) is untested because the Vulkan SDK is not installed |

- Pocket TTS makes full-length studio-voice books practical on a laptop in English, with the same designed cast (slightly less faithful than Qwen). Its cloning weights need a Hugging Face sign-in to download; their CC-BY-4.0 license allows redistribution, so Origami could host them with attribution after checking the gating terms.
- In French, Pocket TTS without cloning is noticeably less accurate than Qwen; French laptop books need either Pocket TTS with cloning (to test once the weights are available) or rendering on a stronger PC.
- qwentts.cpp is the most interesting result: the same Qwen voices and quality as the GPU path, about real time on 4 desktop cores (roughly half that on a laptop, so a 10-hour book overnight and more), with no Python or PyTorch. Its Vulkan and CUDA builds could even replace the Python speech worker everywhere, removing the 2.9 GB PyTorch download. Needs a Vulkan test on a laptop with integrated graphics and a CUDA comparison with the batched fast path.

## 5. Transcription

Parakeet TDT 0.6B v3 (CC-BY-4.0) in Rust through the app's own ONNX Runtime setup, processor only. Native 128-band front end (no extra preprocessor file), greedy TDT decoding with the duration head, word times every 80 ms with a confidence, 30-second windows cut at the quietest point. Token-for-token identical to the Python reference implementation on all 72 test windows.

Normalized word error against the Gutenberg text (LibriVox chapters, announcements removed):

| | English, 18 min | French (Verne), 12 min | French (Dumas), 19 min |
| --- | --- | --- | --- |
| Parakeet, our int8 | **1.9%** | **4.6%** | **3.7%** |
| Parakeet, published int8 | 2.1% | 21.4% (drops sentences, switches to English) | 5.1% |
| Whisper small (today's voice notes) | 3.0% | 10.9% | 12.5% |
| Whisper large-v3-turbo | 2.2% | 3.7% | 8.6% (stops early in some windows) |

- Speed with our int8 model: 16.6x real time on 2 threads, 28x on 4, 42x on 8; 1.2 GB of memory; first window in 0.6 s. A 10-hour audiobook takes about 22 minutes on 4 desktop threads, likely 35 to 55 minutes on a laptop.
- The published int8 encoder must not be used: its quantized convolutions break harder French audio. Our own int8 file quantizes only matrix multiplications (880 MB), so the Studio download is about 900 MB, not 640 MB.
- Punctuation and capitals read like a book; dialogue gets no quotation marks; number style varies.
- Word times: within about one frame inside speech; at pauses words start and end about 170 ms too wide, which snapping to the audio energy fixes.
- 10 hours of audio is 2.3 GB in memory, so the app must transcribe as a stream. int8 output varies with tiny numeric differences, so tests compare error rates, not exact text. Word confidence alone catches only a third to a half of errors.

## 6. Typesetting with Typst

Typst 0.15.1 embedded as a Rust library with our own sandboxed `World` (fonts and files only from the app, no packages, no network); the book is passed as JSON to a fixed template and never becomes Typst code.

| Book | Pages | First compile | After editing a paragraph | PDF export | Peak memory |
| --- | --- | --- | --- | --- | --- |
| Pride and Prejudice, 121k words, 5.5 x 8.5 in | 398 | 0.82 s | 60 ms | 84 ms | 0.53 GB |
| Les Trois Mousquetaires, whole book, 234k words | 786 | 1.29 s | 149 ms | 171 ms | 0.97 GB |

- Works: trims 5 x 8, 5.5 x 8.5, 6 x 9; mirrored margins with the KDP gutter chosen from the real page count; bleed with a correct TrimBox; justified text with optimized line breaking and English and French hyphenation; widows and orphans; chapters on a right-hand page with a sunk opener, 3-line drop cap and small-capital lead-in; scene breaks; running heads; no folio on openers; roman folios in front matter; half-title, title, copyright page with the crane mark, contents; PDF/A-2b and PDF/UA-1 export; preview pages render in about 20 ms.
- French: about 9,000 narrow and no-break spaces checked in the PDF text across the whole book (before ; ! ? :, inside guillemets, after dialogue dashes), none missing. Normalization happens in Rust before Typst.
- Conditions: facing pages are not balanced (a third of mid-chapter pages end one or two lines short); no PDF/X (IngramSpark needs a post-processor); templates must build one shared page table instead of a lookup per page (that cut the French book from 3.7 s and 1.9 GB to 1.3 s and 1 GB).
- Fonts: the Google Fonts builds of EB Garamond, Literata and Crimson Pro have no narrow no-break space glyph (fine in PDF, needed for EPUB); Crimson Pro and the Google build of Libertinus have no small capitals.
- Licenses: all 297 crates are permissive; hayagriva (CC BY-SA citation styles) and two-face (syntax files) embed data that needs third-party notices.
- The new grayscale vector crane is crisp at 4 mm in print; the lavender PNG turns pale gray on black-and-white pages and should be used for screens only. The vector crane is a quick drawing and should be redrawn.

## 7. Audiobook files

All in Rust on Windows except where noted.

| Piece | Result |
| --- | --- |
| Mastering to ACX values | 4 test parts from fail to pass: RMS -20.0, peak -3.5 dBFS, noise floor about -70 dB; still passing after AAC and MP3 encoding; 300 to 500x real time |
| AAC through Windows Media Foundation | about 150 lines with the `windows` crate, AAC-LC mono 44.1 kHz 64 to 192 kbps, about 390x real time, no ffmpeg needed |
| M4B chapters, cover, tags | both chapter forms (Nero list and QuickTime track), 2400 x 2400 cover, narrator, encoder and AI labels; mp4ameta writes a chapter-list version mutagen cannot read, so we rewrite it to version 1 |
| MP3 with chapters | constant 192 kbps through an LGPL ffmpeg build used as a separate program (77 MB full build; a LAME-only build would be a few MB); chapter frames, cover and tags read back by id3, ffprobe and mutagen |
| MP3 through Windows only | 128 kbps mono at most and a 27 ms offset: a fallback, not ACX quality |
| AI metadata | DIGITAL_SOURCE_TYPE, AI_DISCLOSURE, ORIGAMI_EXPORT_ID, encoder, narrator identical in five readers |

Sample files for real players are in `work/studio-phase0/audio/out`.

## 8. Watermark

AudioSeal (MIT code and weights) carrying a 16-bit export ID, applied to the 16 kHz band and added back to the 44.1 kHz master.

- Detected with all 16 bits after AAC 64 and 128 kbps, MP3 64 and 128 kbps, Opus 24 kbps, loudness normalization, phone bandwidth and 3 to 10 second excerpts.
- Not detected after a 1.1x speed change, with or without pitch change.
- Bits only decode on the original 20 ms grid; an offset search recovers them in every shifted case (about 12 s per file).
- False positives: 54 unwatermarked speech files stayed at p 0.30 or less. Proposed rule for "Verify a file": p above 0.5 and bit confidence above 0.2.
- Cost: 1.5 s per audio minute to embed and 0.8 s to detect on 8 threads, about 15 minutes for a 10-hour book. ONNX export works with a fixed 5-second window.
- The watermark sits around 1.1 kHz about 18 dB under the speech: a blind headphone test should confirm it is inaudible before Studio says so.

## 9. Speaker attribution

### Test set

876 spoken lines from three public-domain novels, found by `src/studio/dialogue.ts` and labelled by two independent annotators each (same model family, separate contexts), then checked by hand:

| Book | Lines | Dialogue style | Untagged lines | Characters speaking |
| --- | --- | --- | --- | --- |
| Pride and Prejudice, chapters 1 to 10 | 300 | English quotation marks | 57% | 16 |
| Les Trois Mousquetaires, chapters 1 to 5 | 327 | French dialogue dashes and incises | 25% | 18 |
| Le Tour du monde en quatre-vingts jours, chapters 1 to 10 | 249 | guillemets with dash turns | 41% | 14 |

- The annotators agreed on 879 of 881 units (the two differences were names for the same group speaker). A hand check of 62 labels found one error, a line that this edition gives its own paragraph (Kitty, not Mr. Bennet); it was corrected. Because both annotators come from one model family, shared mistakes are possible; the hand check suggests about 97 to 99% gold accuracy.
- The dialogue finder flagged 0 span problems in English and 34 in Dumas (mostly narration left inside incises) and 15 in Verne; one paragraph per French book with speech was missed. These do not affect who-speaks scoring but are Phase 2 fixes.
- Smaller than the planned 1,500 lines per language; it should grow, and include lesser-known books (see the caution below).

### Results (cast list given, as in published benchmarks)

Rules first; the model answers only the lines the rules are not sure of (below 0.9). Same prompt for every model, answers constrained to a JSON schema, local llama.cpp Vulkan build on the RTX 4080 SUPER, 4-bit models.

| Method | Pride and Prejudice | Trois Mousquetaires | Tour du monde | Time for the 10 chapters (GPU) |
| --- | --- | --- | --- | --- |
| Rules only | 60.0% | 76.5% | 73.9% | instant |
| + Qwen3.5 4B (2.7 GB) | 76.7% | 89.0% | 83.9% | 51 to 59 s |
| + Qwen3.5 9B (5.7 GB) | 83.7% | 88.7% | 89.6% | 67 to 90 s |
| **+ Ministral 3 8B (5.2 GB)** | **95.3%** | **93.6%** | **91.2%** | 76 to 102 s |
| + Ministral 3 3B (2.1 GB) | 80.7% | 85.9% | 83.9% | 45 to 62 s |
| + Gemma 4 E4B (5.0 GB) | 69.3% | 87.5% | 83.1% | 50 to 87 s |

- When the rules are sure (0.9 and above), they are right 97 to 99% of the time, on 29 to 50% of lines: those can be accepted without review.
- Named tags ("said Elizabeth", "dit Athos") are 97 to 99% right with every method; the differences are all on untagged lines (Ministral 8B: 85 to 94%; Qwen 4B: 66 to 72%).
- The most common model error is a two-person exchange where the speakers get swapped partway; trusting the turn-taking rule more helps one book and hurts the others, so it stays at 0.9.
- Processor only, 4 threads, Ministral 3 3B: the Verne chapters took 11 minutes (82%); a whole novel would take about an hour on this desktop and likely 1.5 to 2 hours on a laptop, as a background job.
- Caution: these are famous books that models may partly remember, which can flatter all results and Ministral in particular. The test set needs lesser-known texts before the numbers are quoted in the app.

### Without a hand-made cast list

The real pipeline has no cast list. Ministral 3 8B lists the characters in each 60-paragraph passage (seeing the names found so far), code merges the lists only when a full name matches, and pronouns, long descriptions and aliases shared by two characters are removed. Rules and the model then run with that automatic list; answers are mapped back to the gold characters by name for scoring.

| Book | Automatic list | Speakers found (share of lines) | Rules only | Rules + Ministral 3 8B | With the hand-made list |
| --- | --- | --- | --- | --- | --- |
| Pride and Prejudice | 32 characters, 63 s | 81.7% matched one character | 44.7% | **96.7%** | 95.3% |
| Trois Mousquetaires | 59 characters, 86 s | 89.0% | 74.6% | **92.4%** | 93.6% |
| Tour du monde | 118 characters, 99 s | 99.2% | 73.9% | **92.0%** | 91.2% |

- End to end, automatic casting is as good as a hand-made list. The list over-splits minor and unnamed people (118 entries in Verne), which the cast review merges; group speakers ("Porthos et Aramis") are not found.
- Two design lessons: asking the model to rewrite the whole list each time loses characters (Verne's whist club vanished), and merging on any shared alias chains different people through a surname (Mrs. Bennet, Elizabeth and Darcy became one "Mr. Bennet"). Both are fixed in the test code above and must carry into Phase 2.
- Ministral 3 8B on 4 processor threads: 90.0% on the Verne chapters in 22.5 minutes, about 4 hours per novel on a laptop, so laptops use the 3B model.

## 10. Changes to the plan

1. **Rendering:** Phase 1 uses the batched fast path (8 lines of one voice per step, adapting to free graphics memory), with batched codec decoding next. Plan estimate for a 10-hour book on this PC: about 1 hour instead of 3.5.
2. **Analysis model:** Ministral 3 8B (Apache-2.0, 5.2 GB) replaces Qwen3.5 9B for computers with 8 GB or more of graphics memory; Ministral 3 3B (2.1 GB) or Qwen3.5 4B for the rest, run as a background job per chapter. This changes approved decision 5, which said the French comparison would settle it.
3. **Voice fingerprints:** casting distance and drift checks need a speaker-verification model (3D-Speaker CAM++, Apache-2.0, ONNX); Qwen's own embedding cannot tell voices apart.
4. **Delivery (phase 3):** pace, pauses and emphasis first. Mood references become an option per character, made once with the voice designer and kept only if the voice match stays high. Written instructions are not offered for cloned voices.
5. **Second engine:** dropped from the near term. Chatterbox stays a candidate only for English sound effects such as [laugh] (phase 6).
6. **Laptops:** qwentts.cpp (MIT) is the first candidate: the same designed cast as the GPU path, about real time on 4 desktop cores. Next: a Vulkan build tested on a laptop with integrated graphics, and a CUDA comparison; if both hold, it can replace the Python speech worker and PyTorch. Pocket TTS stays the faster fallback for English.
7. **Transcription:** Parakeet TDT 0.6B v3 with our own int8 model file (about 900 MB download), streamed in 30-second windows; Whisper turbo for other languages with an early-stop check.
8. **Typesetting:** Typst confirmed. Phase 5 adds a facing-page balancing pass, a font step that adds the narrow no-break space glyph for EPUB, and PDF/X through a post-processor if IngramSpark is wanted.
9. **Audio export:** AAC through the operating system; MP3 through a small LGPL ffmpeg build that contains only the MP3 encoder; the M4B chapter-list fix stays in our code.
10. **Watermark:** AudioSeal on the 16 kHz band with an offset search when verifying; detection rule p above 0.5 and bit confidence above 0.2.
11. **Take checks:** the transcription check must accept character names and numbers spelled differently (Bennet or Bennett, sixteen or 16), using the cast list and number normalization.
12. **Text cleanup:** strip invisible characters (word joiners and soft hyphens appear in Standard Ebooks texts) from spoken text.
13. **Test set:** keep growing it, with lesser-known public-domain books, before quoting accuracy in the app.

## 11. Questions for the owner

1. The listening page: for each emotion, which method sounds best, and does the mood reference still sound like the same person? Do the batched lines sound as good as the one-at-a-time lines?
2. Analysis model: switch the default to Ministral 3 (8B on 8 GB+ graphics cards, 3B otherwise), as the results suggest?
3. Short pages in print (Typst): accept them, allow orphan lines to halve them, or plan a balancing pass?
4. The copyright page is a left-hand page, so "bottom right" puts the crane near the spine. Keep bottom right, or use the outer corner (bottom left on that page)?
5. Print: KDP only at first, or IngramSpark too (needs PDF/X work)?
6. MP3: ship a small LGPL ffmpeg (a few MB) for 192 kbps MP3, or accept 128 kbps through Windows only?
7. Watermark: run a short blind headphone test with a few friends before calling it inaudible?
8. Pocket TTS cloning weights are gated on Hugging Face (free sign-in, accept terms). Host them on the Origami hub (allowed by CC-BY-4.0, terms to re-check), or let users download them with their own account?

## Housekeeping

A disk cleanup run by another assistant during the session removed `node_modules` and `src-tauri/target` (about 80 GB). `node_modules` was reinstalled from the lockfile and all tests pass; `target` rebuilds on the next Rust build. Update keys, app data, the hub copy, models and the beta 7 setup were checked and are intact.

## Reproducing

Everything is in `work/studio-phase0`: `tts/` (batched path, delivery, engines, listening page builder), `cpu/` (Pocket TTS, qwentts.cpp), `asr/` (Parakeet in Rust, results.md), `typst/` (Rust typesetter, shots, results.md), `audio/` (mastering, AAC, M4B, MP3, watermark, results.md), `attribution/` (packets, gold labels, rules runner, model runner, scorers), `llm/` (llama.cpp b11714 Vulkan and CPU builds, model files).
