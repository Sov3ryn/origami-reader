# License and legal notice audit, 30 October 2026

**This is not legal advice.** It is a non-lawyer's reading of the licenses and
the code as of beta 19, meant to show what is missing and where the real risks
are. Items marked **Lawyer** should be reviewed by a lawyer (ideally in Quebec)
before a public release. It builds on docs/LICENSING-REVIEW-2026-10-13.md
(still valid for third-party findings) and docs/LIGHT-READER-LICENSING.md.

Scope: npm packages, Rust crates (app and setup), bundled fonts, images and
textures, speech, image, transcription, analysis and watermark models, voice
packs, WebView2, Visual C++, and the Python runtimes and native programs setup
installs.

Status of the work in this audit: notices and installer screens are made but
**not committed, published or released**. The new clauses are a draft
(docs/APP-LICENSE-DRAFT.md) and are not in force.

## Summary

| Area | Verdict |
| --- | --- |
| App license accepted in setup | Yes (step 5, checkbox gates Install). Now also recorded with the license text's SHA-256 in installation.json. |
| Image model licenses accepted | Yes, in setup and in Settings, Models (OpenRAIL-M for DreamShaper, Stability AI Community License for SD-Turbo). |
| Other model licenses | None need acceptance (Apache 2.0, MIT, CC BY 4.0). They need notices, which were incomplete in Settings and missing for Studio. Fixed. |
| Copyleft | The GPL light reader is handled as a separate program. Its third-party corresponding source is still not shipped (section 1.3). LGPL-2.1 libraries (libsoxr, libsndfile, num2words) are loaded as replaceable files, which is allowed; full kits need their source offered. MPL-2.0 Rust crates need a source pointer (added). No npm GPL obligation. |
| Shipped notices | **Rust crate notices are missing from betas 13 to 19** because of a registry path mismatch. Fixed in seal-package.py for the next release. |
| Notices in Settings | Covered the app and source licenses, starter books, OpenDyslexic, cover fonts and globe maps. Missing: models, software components, GPL light reader, Wikimedia portraits, Boards fonts, flag icons, PDF.js. Added. |
| Owner's protective terms | Warranty disclaimer and termination exist. Missing: limitation of liability detail, reverse engineering, beta clause, AI and voice terms, privacy, trademark, governing law, change of terms. Drafted. |

## 1. Required notices that are missing

These were missing from the app's Settings (About and support, Copyright and
licenses) or from the installed files. **Done** means made in this audit.

1. **Model licenses and attributions** (Done). Settings showed no model
   licenses except the image model text inside Settings, Models. Studio's
   models had no notice anywhere in the app. New file
   `docs/licenses/MODEL-NOTICES.txt` (copied into the installed licenses
   folder by the existing `tree(docs/licenses)` step) lists every model, its
   author, license, source and changes, and is shown in Settings, in setup's
   license step and summarised in Studio's setup panel. Settings also shows the
   full Apache 2.0, OpenRAIL-M and Stability AI license texts.
   - **NVIDIA Parakeet TDT 0.6B v3 is CC BY 4.0** and Origami re-quantized its
     encoder. CC BY needs attribution, a license link and a statement that it
     was changed. The NOTICE-studio-models.txt on the voices repository is
     downloaded beside the files, but the app never showed it. Now in Settings.
   - **AudioSeal (MIT)**, **Ministral 3 (Apache 2.0)**, **llama.cpp (MIT)** and
     **Whisper (MIT)**: no notice in Settings before. Added.
   - Apache 2.0 section 4(a) and MIT need the license text itself. Whisper,
     TrOCR and Granite downloaded in the app get a one-line LICENSE.txt
     pointer (`whisper.rs`, `handwriting.rs`, `embed.rs`), not the full text.
     Settings now carries the full texts. Follow-up: write the full text into
     those files too.
2. **Software components** (Done). `licenses/THIRD-PARTY-NOTICES.txt` is made
   by `seal-package.py` and installed, but Settings had no way to reach it.
   Added a "Software components" summary (`docs/licenses/SOFTWARE-NOTICES.txt`)
   and an "Open the licenses folder" button (new `open_licenses_folder`
   command).
3. **GPL light reader** (Done in Settings; source still open). Settings now
   shows LIGHT-READER-SOURCE.txt and the GPL 3.0 text.
   - **Still missing: corresponding source for phonemizer-fork and espeak-ng.**
     LIGHT-READER-SOURCE.txt says a kit "must also include their corresponding
     source archives (or a written offer...)", but no packaging script adds
     them. In the online kit the wheels come straight from PyPI, which
     arguably makes PyPI the distributor, but the full kit (and any kit that
     stages `python-light`) distributes espeak-ng binaries. **Action:** add
     the two sdists (or upstream source tarballs) to the kit, or a written
     offer valid three years. **Lawyer** if you rely on the PyPI argument.
4. **Author portraits from Wikimedia Commons** (Done as a general notice;
   per-image credit needs a check). `public/author-pack` holds 25,611
   portraits. About 10,000 are CC BY or CC BY-SA (CC BY-SA 4.0: 3,265; CC BY-SA
   3.0: 2,640; CC BY 3.0 and 4.0: about 800 each; also 2.0, 2.5, 1.0 and
   ported versions). The per-portrait credit reads "Portrait: artist
   (license), Wikimedia Commons". CC BY needs, where reasonably practicable,
   a link or URI to the license, a link to the source file and a note that the
   image was changed (it is cropped and resized). Settings now explains this
   and links to the CC licenses page. **Action:** add the source file name
   and "cropped" to the credit, or a per-portrait "Image details" link.
   docs/ASSETS.md still says "No portraits are included in the pack", which
   is out of date. **Lawyer**: CC BY-SA ShareAlike on crops packed into .bin
   shards, and whether encrypted update files count as a technological
   measure (CC 4.0 section 2(a)(5)(C)). Low risk, but worth one question.
5. **Boards (Excalidraw) fonts** (Done). `LICENSES.txt` named the licenses
   but had no copyright lines or license texts, which the OFL requires with
   every copy. Added the copyright lines, the OFL 1.1 text and the MIT text.
   Copyright lines were written from the font projects' published notices;
   **check** them against the font files' name tables before release (no
   font tool was installed here to read them).
6. **Flag icons (MIT)** and **PDF.js (Apache 2.0) with Adobe's character map
   license** (Done). The files were in `public/` but not shown in Settings.
7. **Provenance gaps** (not a notice, but needed to make one). docs/ASSETS.md
   has no entry for the 31 Places paintings and masks (`public/places`, 103
   files) or for `public/library-themes/mansion` (PROGRESS.md says the room
   uses CC0 Poly Haven materials, which need no credit). **Action:** record
   who or what made the Places paintings. If they are AI-generated with the
   built-in tool, say so as for the bookmarks.
8. **Qwen license in the online kit.** `package-windows.py` adds
   `Qwen-Apache-2.0.txt` to the "speech" group, which `make-online-windows.py`
   drops. Online installs of Qwen get only the model card README. Low risk
   (users download the weights from Hugging Face themselves), and the full
   Apache text is now in Settings and the licenses folder through
   MODEL-NOTICES. Follow-up: keep license files in the online kit.

9. **Rust crate notices missing from betas 13 to 19 (high, fixed in the
   script).** The beta 19 kit's `licenses/THIRD-PARTY-NOTICES.txt` has 1,383
   sections, all npm, and no Rust crates (checked:
   work/hub/kit/Origami-Reader-Beta-19-Windows). The release recipe passes
   `--cargo-registry work/origami-tools/cargo/registry`, but the crates live
   in `registry/src/<index>/`, so nothing matched and the script stayed
   silent. Betas 5 and 12 had them. `seal-package.py` now accepts both
   layouts and stops if it finds fewer than half the crates. The app and
   setup executables link about 490 and 210 crates whose MIT, Apache,
   Unicode-3.0 and MPL notices must go with the binaries. **Action:** the next
   release fixes it; consider re-sealing the beta 19 kit.
10. **Packages that ship without a license file** (fixed in the script). 30
    Rust crates (13 typst crates, wasmi, webview2-com, krilla, selectors and
    others) and 57 production npm packages (Excalidraw itself and 41
    @radix-ui packages) have no LICENSE file, so the notices skipped them.
    The script now writes their declared license and repository instead.
    Copying the actual text for MIT packages would be better still.
11. 80 dev-only npm packages are included in THIRD-PARTY-NOTICES. Harmless,
    only noise.

### Dependencies: copyleft and use restrictions

Read-only scan of the lockfiles and installed packages (the full per-package list is outside the repo, in the session notes
folder as license-audit-deps.md).

- **npm (664 production packages):** 495 MIT, 74 Apache-2.0, 61 ISC, 20
  BSD-3-Clause, the rest permissive. jszip (MIT or GPL-3.0) and dompurify
  (MPL-2.0 or Apache-2.0) are dual-licensed; Origami uses them under MIT and
  Apache. **No GPL or LGPL obligation.**
- **Rust:** all permissive except **MPL-2.0-only** crates compiled into the
  executables: symphonia (9 crates), cssparser, selectors, dtoa-short,
  option-ext. MPL 2.0 is file-level copyleft: it does not reach Origami's own
  code, but recipients must be told where the source of those files is.
  Now stated in SOFTWARE-NOTICES.txt. Unicode-3.0 and the CC BY-SA 3.0
  citation styles in hayagriva need notices only.
- **Python, light reader:** phonemizer-fork 3.3.2 and espeak-ng (inside
  espeakng-loader 0.2.4) are **GPL-3.0-or-later**: see section 1.3. The
  espeakng-loader wheel carries no license text at all; add GPL text beside it
  in kits that stage it. num2words 0.5.14 is **LGPL-2.1**.
- **Python, speech runtime (Origami's own worker, not GPL):** soxr 1.1.0
  (libsoxr) and soundfile 0.14.0 (libsndfile DLL) are **LGPL-2.1**. They load
  as separate, replaceable libraries, which LGPL allows with a closed
  program, provided the user may replace them and, for kits that ship the
  binaries, the source is offered. The app license must not forbid
  replacing them or reverse engineering for debugging (LGPL 2.1 section 6).
  APP-LICENSE.md already says it takes away no rights those licenses give;
  the draft adds the LGPL explicitly. **Action:** add their source or a
  written offer to full kits; online kits get them from PyPI.
- **NVIDIA and Intel inside PyTorch:** the torch 2.10.0+cu128 wheel contains
  the CUDA 12.8 runtime DLLs, cuDNN 9 and Intel libiomp5md.dll. Full kits
  ship these without NVIDIA's EULA or Intel's license; online kits download
  the wheel from PyTorch. **Action:** add NVIDIA's and Intel's license texts
  to full kits, and check the shipped DLLs are on NVIDIA's redistributable
  list. **Lawyer** if full kits are ever shared publicly.
- **Native files:** the VC++ runtime DLLs are copied from System32 into
  `runtime/` (Microsoft documents app-local deployment from Visual Studio's
  redist folder instead; low risk). The libwebp and libwebm DLLs in the
  stable-diffusion.cpp ZIP have no notice (now named in SOFTWARE-NOTICES).
  ffmpeg is not shipped. The Vulkan loader comes from the GPU driver.
- **Full kits copy the developer's environment, not the locks.** The beta 5
  kit carries 40 light-reader packages not in installer/locks/light.txt. All
  are permissive, but what ships depends on the build machine. Build full
  kits from the locks.
- **Studio's embedded fonts:** EB Garamond and Literata (OFL 1.1) and the
  droplet Typst package (MIT) are compiled into the app. Their license files
  were in the repo but not shown or installed. Now in Settings.

## 2. Licenses that need acceptance

| License | Where it applies | Shown and accepted? |
| --- | --- | --- |
| Origami Reader app license (APP-LICENSE.md) | Every installation | Setup step 5, checkbox required. **Now recorded** (`appTermsAccepted`, `appLicenseSha256` in installation.json). |
| CreativeML OpenRAIL-M (DreamShaper 8 LCM) | When chosen in setup or downloaded in Settings, Models | Yes, full text and checkbox in both places. install.py and add_components.py refuse without it. |
| Stability AI Community License (SD-Turbo) | Same | Yes, full text, "Powered by Stability AI" and checkbox. **Lawyer / owner**: the license has a revenue threshold (USD 1 million) and asks commercial users to register; recheck before a public or donation-funded release. |
| Stability AI Acceptable Use Policy | Incorporated by the Community License | Not shown on its own; it is referenced by URL in the license text. Consider showing it or linking it beside the checkbox. |
| Apache 2.0, MIT, CC BY 4.0 (all other models) | Qwen, Kitten, Kokoro, Granite, TrOCR, Whisper, Ministral 3, llama.cpp, Parakeet, AudioSeal | No acceptance needed. Now shown as notices in setup (Other licenses) and Settings. |
| GNU GPL 3.0 (light reader) | Kitten and Kokoro | GPL needs no acceptance to run. Now shown in Settings and named in setup. |
| Microsoft WebView2 Runtime and Visual C++ Redistributable | Installed by Microsoft's own installers when missing | Their installers carry Microsoft's terms. Origami only offers to run them. **Lawyer**: confirm Microsoft's distribution terms for the Evergreen bootstrapper and vc_redist allow shipping them in the kit (they normally do) and whether a pass-through notice is needed. |
| NVIDIA CUDA libraries (PyTorch cu128 wheels) | Computers with an NVIDIA card | Downloaded from PyTorch, not shipped by Origami in the online kit. The full kit staged them. NVIDIA's EULA allows redistribution of listed files only. Noted in Software components. |

Gaps:

- **Updated terms are never re-accepted.** In-app updates replace files but
  never show a changed APP-LICENSE.md. If you adopt the draft, add a one-time
  prompt in the app when the installed license hash differs from the one
  accepted (the new installation.json field makes this possible).
- Setup's license step is shown only in the native installer (`native &&
  step === 5`); the HTML preview shows none, which is fine because it
  installs nothing.
- install.py does not refuse an install without `appTermsAccepted` (the UI
  gate is the only check). I recorded it rather than enforced it, so the
  release harness (work/install-harness.py) keeps working. Enforce it once the
  harness sends the flag.

## 3. Protective clauses you could add

Drafted in **docs/APP-LICENSE-DRAFT.md** for your approval. Nothing there is in
force; setup and Settings still show APP-LICENSE.md.

| Clause | In APP-LICENSE.md today | Draft |
| --- | --- | --- |
| Disclaimer of warranty | Short "as is" | Expanded: quality, fitness, AI accuracy, non-infringement |
| Limitation of liability | One line | Excludes indirect and data loss; cap of the greater of the price paid and CAD 50; carve-out for gross fault and bodily or moral injury (Quebec Civil Code art. 1474). **Lawyer** |
| Reverse engineering | Not covered | Forbidden except where the law allows it or a component's license (LGPL, GPL) allows it; source can be read under PolyForm Strict instead |
| Redistribution | Covered | Unchanged; consistent with PolyForm Strict (no distribution of the source) |
| Circumventing credit, AI metadata, watermark, update signatures | Not covered | Forbidden |
| Beta / test software | Only in the in-app "Private beta" notice | New clause |
| AI content and voices | Model restrictions only | No imitating real people's voices without permission; no impersonation, deception or unlawful use; users responsible for imported content and output; keep the Studio credit, metadata and watermark; disclose AI content where required |
| Privacy | In-app note only | Local processing; exactly what goes online (updates from GitHub, model and voice downloads, setup's PyPI and PyTorch downloads, links, Work mode embeds) |
| Feedback | Not covered | Owner may use feedback freely |
| Name and logo | One line | Expanded, plus no-endorsement for third-party names |
| Governing law | Not covered | Quebec and Canada, court district to choose. **Lawyer** |
| Termination | 32-day cure | Kept; adds delete copies, what survives, output stays the user's |
| Changes to terms | Not covered | New terms shown and agreed in the app before use (needs the re-acceptance prompt above) |
| Severability, whole agreement | Not covered | Added |

## For a lawyer

1. **Translated license (addressed; lawyer to confirm).** Since 1 June 2023
   (Bill 96), Quebec's Charter of the French Language (section 55) requires
   contracts of adhesion, such as an app license accepted by checkbox, to be
   given in French before the parties can choose English. The owner's
   decision: the license is available in all 20 languages. Setup and Settings
   now show APP-LICENSE.md and the model notices in the chosen language
   (docs/licenses/translations), with the English original one click away,
   and installation.json records the language shown. Third-party licenses
   stay in their official English, with a translated note saying so. Ask a
   lawyer: which version prevails (the draft says English, except where local
   law gives effect to the local version), and have the French text reviewed
   by a French-speaking lawyer. The translations are machine-made and should
   be checked by native speakers, at least French.
2. Limitation of liability and warranty exclusions against Quebec consumers
   (Consumer Protection Act, Civil Code arts. 1474 and 3117) and consumers
   elsewhere (EU, UK).
3. GPL corresponding source for espeak-ng and phonemizer-fork (section 1.3).
4. Stability AI Community License terms for a donation-funded public release,
   and DreamShaper's "no selling the model" field (docs/MODEL-DISTRIBUTION.md).
5. CC BY-SA portraits: attribution form and ShareAlike for the crops.
6. EU AI Act article 50 (from August 2026): Origami labels Studio audio with
   metadata, a watermark and a spoken credit. Pictures (added 30 October):
   every cover and portrait made with an image model gets an invisible
   TrustMark watermark (Adobe, MIT code and weights; variant Q, 61-bit
   Origami payload with BCH-5; tested at 41.7 dB PSNR, no bit errors after a
   75% resize and JPEG at quality 80; checked in the desktop app with
   DreamShaper 8 LCM, where a cover and a portrait read back with no bit
   errors at full size and as the library's small WebP), and
   files written by Saved artwork carry IPTC "trained algorithmic media" XMP plus a description (PNG, WebP,
   JPEG). Imported and custom covers are not marked. The encoder
   (17 MB, SHA-256 pinned) ships in runtime/trustmark through
   refresh-windows.py and app updates; without it or the ONNX Runtime,
   pictures are kept unmarked. In-app narration is presented as AI and needs
   no mark. Check that this satisfies the provider duty, and what users must
   disclose when they publish.
7. The draft clauses as a whole, including the governing-law choice.
8. Earlier items still open from LICENSING-REVIEW-2026-10-13.md: taxes on
   donations, and the voice packs (now synthetic Qwen VoiceDesign voices,
   which removes the ElevenLabs issue for current packs; confirm no
   ElevenLabs-derived reference remains in any published pack or in
   origami-voices).

## Files changed in this audit (uncommitted)

- `docs/licenses/MODEL-NOTICES.txt` (new): models and voices.
- `docs/licenses/SOFTWARE-NOTICES.txt` (new): software components summary.
- `docs/APP-LICENSE-DRAFT.md` (new): proposed terms, not in force.
- `docs/LICENSE-AUDIT-2026-10-30.md` (new): this report.
- `public/excalidraw-assets/fonts/LICENSES.txt`: copyright lines, OFL and MIT texts.
- `src/App.tsx`: new entries in Settings, Copyright and licenses (models and
  voices, Apache 2.0, software components with Open the licenses folder,
  light reader and GPL, Wikimedia portraits, Studio print fonts, Boards
  fonts, flag icons, PDF.js).
- `src/storage.ts`, `src-tauri/src/lib.rs`: `open_licenses_folder`.
- `src/studio/StudioSetup.tsx`: model licenses line in Studio's setup.
- `installer/src/App.tsx`: "Other licenses" card with the model notices on the
  license step; sends `appTermsAccepted`.
- `installer/scripts/seal-package.py`: finds Rust crates under either registry
  layout, stops if most are missing, and names the license of packages
  without a license file.
- `installer/scripts/install.py`: records the app license acceptance and the
  license text's SHA-256 in installation.json.

All 20 languages: APP-LICENSE.md and MODEL-NOTICES.txt are translated in
docs/licenses/translations (machine translations, to be checked by native
speakers), loaded by src/licenseTexts.ts in setup and in Settings, and
installed in licenses/translations by refresh-windows.py. The new interface
strings are in all 19 locale files. Terms with no earlier app translation
("Light reader", the plural "Boards") were chosen by the translators; the
legal texts use the formal register even where the app uses the informal one
(Italian, Spanish, Dutch). When the draft license is approved, its text needs
the same translation pass.
