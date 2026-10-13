# Local cover generation

Origami can generate artwork for new imports and pasted documents that lack a usable cover. Generate missing covers automatically is enabled by default in Settings. Embedded EPUB covers are imported first. Existing artwork is preserved. The Library cover's bottom-left image button and Reader's Document tab open the cover editor. Choose a PNG, JPEG or WebP image, edit the cover description, or generate another random take. Uploaded covers retain their complete artwork; generated covers receive title and author text from the app.

The tested engine is [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp), pinned to release master-959-d637cfb, with [Stability AI SD-Turbo](https://huggingface.co/stabilityai/sd-turbo) converted to F16 GGUF. It uses two Euler steps, guidance 1, a discrete scheduler and small 320 x 448 portrait output. There is no high-resolution or upscale pass. This renders about 27% fewer pixels than the previous 384 x 512 size. The compressed Q4 version produced artifacts in this test and is not the default. The F16 model occupies about 2.7 GB on disk; lowering raster dimensions does not reduce the weight file or eliminate model-loading cost. No model or native runtime is included in Git.

Generation starts a separate process, loads the model, produces one image, and exits. Idle cover generation consumes no model VRAM. The app unloads its speech worker before generating a cover. Pressing Play cancels a cover job before starting speech. Automatic jobs wait until playback is stopped. Cancel generation and closing Origami terminate and reap the app's cover process. Generation has a three-minute timeout. Draft PNG files are removed after reading; the accepted generated cover stays at 320 x 448, is converted to WebP and is stored in the library metadata. Uploaded or imported artwork keeps its existing 384 x 544 storage budget.

## Prompts and content modes

The native generator always adds vertical, flat, full-bleed book-cover composition and text-free instructions outside the editable description. Origami supplies the title and author as interface typography. Automatic descriptions extract a few landscape or object motifs from local book metadata and opening paragraphs; they do not pass raw prose, the printed book title or author into the image prompt. Users can replace the visual description in the cover editor.

Allow mature cover artwork (NSFW) is unchecked by default, with the same saved preference in Settings and the cover editor. Standard mode requests wholesome symbolic scenery or still-life artwork; when a human subject is requested, it specifies fully clothed adults. Mature mode permits adult themes with non-explicit imagery, retaining text-free instructions and excluding explicit sexual acts and graphic violence. The mode applies to generation and does not restrict what books or raster artwork the user can import.

The six selected starter books are general fiction, with no erotica selections. Starter covers always use standard mode, even if mature generation is enabled for user documents. Both frontend and backend recognize starter editions by their prepared EPUB hashes, so importing one with a new library ID does not remove that protection. The existing fictional demo entries are also protected.

This is prompt guidance, not an image-content classifier or a guarantee that every output is suitable. [SD-Turbo does not use negative prompts at its intended guidance setting](https://huggingface.co/stabilityai/sd-turbo), so this integration uses positive instructions and does not claim a negative-prompt safety filter. The book-cover layout and content mode precede the editable description to avoid placing them beyond the model's short text context. Review generated artwork before sharing it.

Only raster image bytes are decoded. SVG covers, remote EPUB artwork and external image URLs are not imported. Covers are limited to 10 MB input and 40 megapixels. Copies in the library are independent of the original image file.

## Windows setup

Review the [model's license](https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md), then run from the repository:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-cover-engine.ps1
```

Setup downloads about 5.2 GB of source weights and needs about 8 GB of free space temporarily. Conversion leaves the 2.7 GB F16 model and removes the setup's source download. The Vulkan runtime supports compatible NVIDIA/AMD/Intel drivers. The tested development machine uses an NVIDIA RTX 4080 SUPER. Reopen Origami after setup. Configuration is written to `%APPDATA%/app.origami.reader/cover-engine.json`.

This workspace's local development installation is already configured through `.local/cover-engine.json`; both desktop:dev and the local launcher set ORIGAMI_COVER_CONFIG automatically. No Maeve environment is modified.

## Linux setup

Linux execution has not yet been tested. Download or build the matching Linux stable-diffusion.cpp runtime from the official release. Download the SD-Turbo checkpoint from its model page, then convert it:

```sh
./sd-cli -M convert -m sd_turbo.safetensors -o sd-turbo-f16.gguf --type f16
```

Copy workers/cover-engine.example.json to `~/.config/app.origami.reader/cover-engine.json`. Set executable and model to absolute paths and backend to `vulkan0` for a compatible Vulkan GPU, or `cpu` for CPU inference. Set ORIGAMI_COVER_CONFIG to a custom configuration path if needed. CPU generation can be substantially slower and is subject to the same timeout. The native model process is launched with structured arguments, without a shell.

## Terms and attribution

Powered by Stability AI. SD-Turbo has its own [Stability AI Community License](https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md), separate from Origami's MIT code license. This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved. Model distribution must retain its license and attribution. The native runtime has its own MIT license. Public model installation and packaging remain separate from the source repository.

ORIGAMI_DATA_DIR can point to an isolated library directory for native testing. It does not change the default user library when unset.
