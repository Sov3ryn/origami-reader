# Local cover generation

Origami can generate artwork for new imports and pasted documents that lack a usable cover. Generate missing covers automatically is enabled by default in Settings. Embedded EPUB covers are imported first. Existing artwork is preserved. The Library cover's bottom-left image button and Reader's Document tab open the cover editor. Choose a PNG, JPEG or WebP image, edit the cover description, or generate another random take. Uploaded covers retain their complete artwork; generated covers receive title and author text from the app.

The default image model is [DreamShaper 8 LCM by Lykon](https://huggingface.co/Lykon/dreamshaper-8-lcm), about 2.1 GB, shared with voice portraits. It runs through [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp), pinned to release master-959-d637cfb, with six LCM steps, guidance 2 and the LCM scheduler. Covers render at 512 x 704 to retain facial and scene quality, then are downsampled to a small 320 x 448 WebP. There is no upscale pass. The process uses a 3 GiB managed GPU-memory budget; this excludes driver allocations and unrelated applications, and does not certify a physical minimum GPU size. Model weights and native runtime files are excluded from Git.

Legacy SD-Turbo configurations still work at 320 x 448, two Euler steps and guidance 1. A cover override can select DreamShaper without altering the root legacy model, so an already-running older app continues using its correct profile until restarted. Existing saved artwork is preserved; regeneration is explicit.

Generation starts a separate process, loads the model, produces one image, and exits. Idle cover generation consumes no model VRAM. The app unloads its speech worker before generating a cover. Pressing Play cancels a cover job before starting speech. Automatic jobs wait until playback is stopped. Cancel generation and closing Origami terminate and reap the app's cover process. Generation has a three-minute timeout. Draft PNG files are removed after reading; the accepted generated cover stays at 320 x 448, is converted to WebP and is stored in the library metadata. Uploaded or imported artwork keeps its existing 384 x 544 storage budget.

## Prompts and content modes

The native generator always adds vertical, flat, full-bleed book-cover composition and text-free instructions outside the editable description. Origami supplies the title and author as interface typography. Automatic descriptions extract a few landscape or object motifs from local book metadata and opening paragraphs; they do not pass raw prose, the printed book title or author into the image prompt. Users can replace the visual description in the cover editor.

Allow mature cover artwork (NSFW) is unchecked by default, with the same saved preference in Settings and the cover editor. Standard mode requests wholesome symbolic scenery or still-life artwork; when a human subject is requested, it specifies fully clothed adults. Mature mode permits adult themes with non-explicit imagery, retaining text-free instructions and excluding explicit sexual acts and graphic violence. The mode applies to generation and does not restrict what books or raster artwork the user can import.

The six selected starter books are general fiction, with no erotica selections. Starter covers always use standard mode, even if mature generation is enabled for user documents. Both frontend and backend recognize starter editions by their prepared EPUB hashes, so importing one with a new library ID does not remove that protection. The existing fictional demo entries are also protected.

This is prompt guidance, not an image-content classifier or a guarantee that every output is suitable. DreamShaper receives negative guidance against lettering, logos, watermarks and mockup borders in every mode. Standard mode additionally discourages nudity, naked subjects and sexual content. Mature mode keeps the exclusions for explicit sexual acts and graphic violence. The legacy SD-Turbo profile does not use negative guidance at its intended setting. The layout and content-mode wrapper remains outside the editable description.

Only raster image bytes are decoded. SVG covers, remote EPUB artwork and external image URLs are not imported. Covers are limited to 10 MB input and 40 megapixels. Copies in the library are independent of the original image file.

## Windows setup

Review [model terms](MODEL-DISTRIBUTION.md), then run from the repository:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-cover-engine.ps1
```

Setup downloads the approximately 2.1 GB checkpoint and a small native runtime. It verifies the checkpoint hash and copies the model license and notices. No conversion or second checkpoint is needed for portraits. The Vulkan runtime supports compatible NVIDIA/AMD/Intel drivers. Native testing used an RTX 4080 SUPER. Reopen Origami after setup. Configuration is written to `%APPDATA%/app.origami.reader/cover-engine.json`. `-Config` and `-Directory` can target an isolated setup.

This workspace's local development installation is already configured through `.local/cover-engine.json`; both desktop:dev and the local launcher set ORIGAMI_COVER_CONFIG automatically. No Maeve environment is modified.

## Linux setup

Linux execution has not yet been tested. Download or build the matching Linux stable-diffusion.cpp runtime and the verified DreamShaper checkpoint described in VOICE-PORTRAITS.md. Point `executable` to the native runtime, and use `cover` and `portrait` objects with absolute checkpoint paths and `profile: "dreamshaper-8-lcm"`. No model conversion is needed. CPU execution is supported but substantially slower. The legacy SD-Turbo conversion remains available for old configurations:

```sh
./sd-cli -M convert -m sd_turbo.safetensors -o sd-turbo-f16.gguf --type f16
```

Copy workers/cover-engine.example.json to `~/.config/app.origami.reader/cover-engine.json`. Set executable and model to absolute paths and backend to `vulkan0` for a compatible Vulkan GPU, or `cpu` for CPU inference. Set ORIGAMI_COVER_CONFIG to a custom configuration path if needed. CPU generation can be substantially slower and is subject to the same timeout. The native model process is launched with structured arguments, without a shell.

## Terms and attribution

DreamShaper is by Lykon and uses a Stable Diffusion base, with CreativeML OpenRAIL-M model terms. It remains separate from Origami's MPL 2.0 code and the native runtime's MIT license. Free bundling requires retaining the model license, notices and enforceable use restrictions. The author's listed permissions do not include selling the model itself; confirm permission before a paid bundle containing weights. See MODEL-DISTRIBUTION.md and docs/licenses/DreamShaper-distribution-record.json. Legacy SD-Turbo retains its own Stability AI license and attribution.

ORIGAMI_DATA_DIR can point to an isolated library directory for native testing. It does not change the default user library when unset.
